import { describe, it, expect, vi, beforeEach } from "vitest";
import { StakingService } from "../../src/cardano-chain/services/staking-service";
import type { BlockfrostRpcClientContract } from "../../src/cardano-chain/rpc/blockfrost-rpc-client-contract";
import type {
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
} from "../../src/cardano-chain/rpc/blockfrost-rpc-types";
import type { CacheContract, Validator } from "@guardian-sdk/sdk";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const POOL_1_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";
const POOL_2_ID = "pool1qqqqx65aq36envsj7en7lxmqgmj4gajlsf7s8vl8xdzmwxk7ga4";

function makePool(
  poolId: string,
  overrides: Partial<BlockfrostPoolExtended> = {}
): BlockfrostPoolExtended {
  return {
    pool_id: poolId,
    hex: "a".repeat(56),
    vrf_key: "b".repeat(64),
    blocks_minted: 1000,
    blocks_epoch: 3,
    live_stake: "10000000000000",
    live_size: 0.002,
    live_saturation: 0.5,
    live_delegators: 1500,
    active_stake: "9000000000000",
    active_size: 0.0018,
    declared_pledge: "500000000000",
    live_pledge: "500000000000",
    margin_cost: 0.02, // 2%
    fixed_cost: "340000000", // 340 ADA
    reward_account: "stake1" + "a".repeat(53),
    owners: [],
    registration: ["tx1"],
    retirement: [], // active (not retiring)
    ...overrides,
  };
}

function makeMetadata(poolId: string, name: string): BlockfrostPoolMetadata {
  return {
    pool_id: poolId,
    hex: "a".repeat(56),
    url: "https://pool.example.com",
    hash: "c".repeat(64),
    ticker: "POOL",
    name,
    description: `Description for ${name}`,
    homepage: "https://example.com",
  };
}

function makeAccount(
  active: boolean,
  poolId: string | null,
  controlledAmount = "10000000",
  withdrawableAmount = "2100000"
) {
  return {
    stake_address: "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa",
    active,
    active_epoch: active ? 350 : null,
    controlled_amount: controlledAmount,
    rewards_sum: "1000000",
    withdrawals_sum: "0",
    reserves_sum: "0",
    treasury_sum: "0",
    withdrawable_amount: withdrawableAmount,
    pool_id: poolId,
  };
}

function makeNetwork(liveStake = "25000000000000000") {
  return {
    supply: {
      max: "45000000000000000",
      total: "35000000000000000",
      circulating: "33000000000000000",
      locked: "2000000000000000",
      treasury: "800000000000000",
      reserves: "9200000000000000",
    },
    stake: {
      live: liveStake,
      active: "24000000000000000",
    },
  };
}

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeCache(): CacheContract<string, Validator[]> {
  const store = new Map<string, Validator[]>();
  return {
    get: vi.fn((key: string) => store.get(key) ?? null),
    set: vi.fn((key: string, value: Validator[]) => { store.set(key, value); }),
    has: vi.fn((key: string) => store.has(key)),
    delete: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
    size: vi.fn(() => store.size),
  };
}

function makeRpcClient(
  pools: BlockfrostPoolExtended[],
  metadata: (BlockfrostPoolMetadata | null)[],
  account = makeAccount(true, POOL_1_ID),
  network = makeNetwork()
): BlockfrostRpcClientContract {
  return {
    getPools: vi.fn().mockResolvedValue(pools),
    getPoolMetadata: vi.fn().mockImplementation(async (poolId: string) => {
      const idx = pools.findIndex((p) => p.pool_id === poolId);
      return idx >= 0 ? metadata[idx] : null;
    }),
    getAccount: vi.fn().mockResolvedValue(account),
    getUtxos: vi.fn(),
    getProtocolParams: vi.fn(),
    getNetwork: vi.fn().mockResolvedValue(network),
    submitTx: vi.fn(),
  };
}

const STAKE_ADDRESS = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("StakingService", () => {
  describe("getValidators", () => {
    it("returns validators with correct fields from pool + metadata", async () => {
      const pool = makePool(POOL_1_ID);
      const meta = makeMetadata(POOL_1_ID, "My Stake Pool");
      const service = new StakingService(makeCache(), makeRpcClient([pool], [meta]));

      const validators = await service.getValidators();

      expect(validators).toHaveLength(1);
      const v = validators[0];
      expect(v.id).toBe(POOL_1_ID);
      expect(v.name).toBe("My Stake Pool");
      expect(v.description).toBe("Description for My Stake Pool");
      expect(v.operatorAddress).toBe(POOL_1_ID);
      expect(v.creditAddress).toBe(POOL_1_ID);
      expect(v.delegators).toBe(pool.live_delegators);
      expect(v.image).toBeUndefined();
    });

    it("sets status to Active for a pool without retirement", async () => {
      const pool = makePool(POOL_1_ID, { retirement: [] });
      const service = new StakingService(makeCache(), makeRpcClient([pool], [null]));

      const validators = await service.getValidators();
      expect(validators[0].status).toBe("Active");
    });

    it("sets status to Inactive for a pool with a retirement certificate", async () => {
      const pool = makePool(POOL_1_ID, { retirement: ["retiring_epoch_tx"] });
      const service = new StakingService(makeCache(), makeRpcClient([pool], [null]));

      const validators = await service.getValidators();
      expect(validators[0].status).toBe("Inactive");
    });

    it("falls back to ticker when name is null", async () => {
      const pool = makePool(POOL_1_ID);
      const meta: BlockfrostPoolMetadata = { ...makeMetadata(POOL_1_ID, ""), name: null, ticker: "TICK" };
      const service = new StakingService(makeCache(), makeRpcClient([pool], [meta]));

      const validators = await service.getValidators();
      expect(validators[0].name).toBe("TICK");
    });

    it("falls back to truncated pool ID when both name and ticker are null", async () => {
      const pool = makePool(POOL_1_ID);
      const meta: BlockfrostPoolMetadata = { ...makeMetadata(POOL_1_ID, ""), name: null, ticker: null };
      const service = new StakingService(makeCache(), makeRpcClient([pool], [meta]));

      const validators = await service.getValidators();
      expect(validators[0].name).toContain(POOL_1_ID.slice(0, 16));
    });

    it("uses truncated pool ID as name when metadata is null", async () => {
      const pool = makePool(POOL_1_ID);
      const service = new StakingService(makeCache(), makeRpcClient([pool], [null]));

      const validators = await service.getValidators();
      expect(validators[0].name).toContain(POOL_1_ID.slice(0, 16));
    });

    it("filters validators by Active status", async () => {
      const activePool = makePool(POOL_1_ID, { retirement: [] });
      const inactivePool = makePool(POOL_2_ID, { retirement: ["retiring_tx"] });
      const service = new StakingService(
        makeCache(),
        makeRpcClient([activePool, inactivePool], [null, null])
      );

      const active = await service.getValidators("Active");
      expect(active).toHaveLength(1);
      expect(active[0].status).toBe("Active");
    });

    it("filters validators by Inactive status", async () => {
      const activePool = makePool(POOL_1_ID, { retirement: [] });
      const inactivePool = makePool(POOL_2_ID, { retirement: ["retiring_tx"] });
      const service = new StakingService(
        makeCache(),
        makeRpcClient([activePool, inactivePool], [null, null])
      );

      const inactive = await service.getValidators("Inactive");
      expect(inactive).toHaveLength(1);
      expect(inactive[0].status).toBe("Inactive");
    });

    it("returns all validators when no status filter is provided", async () => {
      const activePool = makePool(POOL_1_ID, { retirement: [] });
      const inactivePool = makePool(POOL_2_ID, { retirement: ["retiring_tx"] });
      const service = new StakingService(
        makeCache(),
        makeRpcClient([activePool, inactivePool], [null, null])
      );

      const all = await service.getValidators();
      expect(all).toHaveLength(2);
    });

    it("caches validators after first fetch", async () => {
      const rpcClient = makeRpcClient([makePool(POOL_1_ID)], [null]);
      const service = new StakingService(makeCache(), rpcClient);

      await service.getValidators();
      await service.getValidators();

      // getPools should only be called once — second call hits cache
      expect(rpcClient.getPools).toHaveBeenCalledTimes(1);
    });

    it("returns cached validators on second call", async () => {
      const cache = makeCache();
      const rpcClient = makeRpcClient([makePool(POOL_1_ID)], [null]);
      const service = new StakingService(cache, rpcClient);

      const first = await service.getValidators();
      const second = await service.getValidators();

      expect(first).toEqual(second);
    });

    it("computes a non-negative APY", async () => {
      const pool = makePool(POOL_1_ID);
      const service = new StakingService(makeCache(), makeRpcClient([pool], [null]));

      const validators = await service.getValidators();
      expect(validators[0].apy).toBeGreaterThanOrEqual(0);
    });

    it("computes lower APY for a fully saturated pool", async () => {
      const normalPool = makePool(POOL_1_ID, { live_saturation: 0.5 });
      const saturatedPool = makePool(POOL_2_ID, { live_saturation: 2.0 });
      const service = new StakingService(
        makeCache(),
        makeRpcClient([normalPool, saturatedPool], [null, null])
      );

      const validators = await service.getValidators();
      const normalApy = validators.find((v) => v.id === POOL_1_ID)!.apy;
      const saturatedApy = validators.find((v) => v.id === POOL_2_ID)!.apy;
      expect(saturatedApy).toBeLessThan(normalApy);
    });
  });

  describe("getDelegations", () => {
    it("returns an active delegation when account is delegating", async () => {
      const pool = makePool(POOL_1_ID);
      const account = makeAccount(true, POOL_1_ID, "10000000");
      const rpcClient = makeRpcClient([pool], [null], account);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);

      expect(result.delegations).toHaveLength(1);
      const delegation = result.delegations[0];
      expect(delegation.validator.operatorAddress).toBe(POOL_1_ID);
      expect(delegation.amount).toBe(10_000_000n);
      expect(delegation.status).toBe("Active");
    });

    it("returns empty delegations when account is not active", async () => {
      const account = makeAccount(false, null, "10000000");
      const rpcClient = makeRpcClient([makePool(POOL_1_ID)], [null], account);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.delegations).toHaveLength(0);
    });

    it("returns empty delegations when account is active but has no pool", async () => {
      const account = makeAccount(true, null, "10000000");
      const rpcClient = makeRpcClient([makePool(POOL_1_ID)], [null], account);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.delegations).toHaveLength(0);
    });

    it("sets delegationIndex to 0n (not applicable in Cardano)", async () => {
      const pool = makePool(POOL_1_ID);
      const rpcClient = makeRpcClient([pool], [null], makeAccount(true, POOL_1_ID));
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.delegations[0].delegationIndex).toBe(0n);
    });

    it("sets pendingUntil to 0 (no unbonding period)", async () => {
      const pool = makePool(POOL_1_ID);
      const rpcClient = makeRpcClient([pool], [null], makeAccount(true, POOL_1_ID));
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.delegations[0].pendingUntil).toBe(0);
    });

    it("creates an unknown validator placeholder for pools not in the cache", async () => {
      const UNKNOWN_POOL_ID = "pool1unknownpoolid000000000000000000000000000000000000000";
      const account = makeAccount(true, UNKNOWN_POOL_ID, "10000000");
      // No pools in the cache that match
      const rpcClient = makeRpcClient([makePool(POOL_1_ID)], [null], account);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);

      expect(result.delegations).toHaveLength(1);
      expect(result.delegations[0].validator.operatorAddress).toBe(UNKNOWN_POOL_ID);
    });

    it("returns stakingSummary with correct fields", async () => {
      const pool = makePool(POOL_1_ID);
      const network = makeNetwork("25000000000000000");
      const rpcClient = makeRpcClient([pool], [null], makeAccount(true, POOL_1_ID), network);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      const summary = result.stakingSummary;

      expect(summary.totalProtocolStake).toBeGreaterThan(0);
      expect(summary.minAmountToStake).toBe(2_000_000n);
      expect(summary.unboundPeriodInMillis).toBe(0);
      expect(summary.redelegateFeeRate).toBe(0);
      expect(typeof summary.maxApy).toBe("number");
      expect(summary.maxApy).toBeGreaterThanOrEqual(0);
    });

    it("totalProtocolStake is in ADA (divided by 1_000_000)", async () => {
      const pool = makePool(POOL_1_ID);
      const network = makeNetwork("25000000000000000"); // 25 billion ADA
      const rpcClient = makeRpcClient([pool], [null], makeAccount(true, POOL_1_ID), network);
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      // 25_000_000_000_000_000 lovelaces / 1_000_000 = 25_000_000_000 ADA
      expect(result.stakingSummary.totalProtocolStake).toBeCloseTo(25_000_000_000, -3);
    });

    it("activeValidators count only includes non-retiring pools", async () => {
      const activePool = makePool(POOL_1_ID, { retirement: [] });
      const inactivePool = makePool(POOL_2_ID, { retirement: ["tx1"] });
      const rpcClient = makeRpcClient(
        [activePool, inactivePool],
        [null, null],
        makeAccount(true, POOL_1_ID)
      );
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.stakingSummary.activeValidators).toBe(1);
      expect(result.stakingSummary.totalValidators).toBe(2);
    });

    it("delegation id includes the pool ID", async () => {
      const pool = makePool(POOL_1_ID);
      const rpcClient = makeRpcClient([pool], [null], makeAccount(true, POOL_1_ID));
      const service = new StakingService(makeCache(), rpcClient);

      const result = await service.getDelegations(STAKE_ADDRESS);
      expect(result.delegations[0].id).toContain(POOL_1_ID);
    });
  });
});