import { describe, it, expect, vi } from "vitest";
import { StakingService } from "../../src/cardano-chain/services/staking-service";
import { InMemoryCache } from "@guardian-sdk/sdk";
import poolsFixture from "../fixtures/pools.json";
import poolMetadataFixture from "../fixtures/pool_metadata.json";
import accountFixture from "../fixtures/account.json";
import networkFixture from "../fixtures/network.json";
import type {
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostAccount,
  BlockfrostNetwork,
} from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

const POOLS = poolsFixture as BlockfrostPoolExtended[];
const POOL_1_ID = POOLS[0].pool_id;

function makeRpcClient(
  overrides: {
    pools?: BlockfrostPoolExtended[];
    metadata?: BlockfrostPoolMetadata | null;
    account?: Partial<BlockfrostAccount>;
    network?: BlockfrostNetwork;
  } = {}
) {
  const pools = overrides.pools ?? POOLS;
  const metadataResult =
    overrides.metadata !== undefined
      ? overrides.metadata
      : (poolMetadataFixture as BlockfrostPoolMetadata);
  const account = { ...accountFixture, ...overrides.account } as BlockfrostAccount;
  const network = overrides.network ?? (networkFixture as BlockfrostNetwork);

  return {
    getPools: vi.fn().mockResolvedValue(pools),
    getPoolMetadata: vi.fn().mockResolvedValue(metadataResult),
    getAccount: vi.fn().mockResolvedValue(account),
    getNetwork: vi.fn().mockResolvedValue(network),
    getUtxos: vi.fn(),
    getProtocolParams: vi.fn(),
    submitTx: vi.fn(),
  };
}

describe("StakingService", () => {
  describe("getValidators", () => {
    it("fetches pools from RPC on the first call", async () => {
      const rpcClient = makeRpcClient();
      const service = new StakingService(new InMemoryCache(), rpcClient as any);

      await service.getValidators();

      expect(rpcClient.getPools).toHaveBeenCalledTimes(1);
    });

    it("returns cached validators on second call without hitting the RPC again", async () => {
      const rpcClient = makeRpcClient();
      const service = new StakingService(new InMemoryCache(), rpcClient as any);

      await service.getValidators();
      await service.getValidators();

      expect(rpcClient.getPools).toHaveBeenCalledTimes(1);
    });

    it("maps an active pool (no retirement) to status Active", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();
      const active = validators.find((v) => v.operatorAddress === POOL_1_ID);

      expect(active).toBeDefined();
      expect(active!.status).toBe("Active");
    });

    it("maps a retiring pool to status Inactive", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();
      const retiring = validators.find((v) => v.operatorAddress === POOLS[1].pool_id);

      expect(retiring).toBeDefined();
      expect(retiring!.status).toBe("Inactive");
    });

    it("uses metadata name when available", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();
      const pool1 = validators.find((v) => v.operatorAddress === POOL_1_ID);

      // Pool 1 has metadata with name "StakeNuts" (from pool_metadata.json fixture)
      expect(pool1!.name).toBe("StakeNuts");
    });

    it("falls back to pool_id prefix when metadata is null", async () => {
      const rpcClient = makeRpcClient({ metadata: null });
      const service = new StakingService(new InMemoryCache(), rpcClient as any);

      const validators = await service.getValidators();
      const pool1 = validators.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.name).toBe(POOL_1_ID.slice(0, 16) + "...");
    });

    it("returns two validators matching the fixture", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();

      expect(validators).toHaveLength(2);
    });

    it("sets operatorAddress and creditAddress to the pool bech32 ID", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();
      const pool1 = validators.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.operatorAddress).toBe(POOL_1_ID);
      expect(pool1!.creditAddress).toBe(POOL_1_ID);
    });

    it("reports a positive APY for a non-saturated pool with margin < 100%", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const validators = await service.getValidators();
      const pool1 = validators.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.apy).toBeGreaterThan(0);
    });

    it("filters by a single status", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const active = await service.getValidators("Active");
      const inactive = await service.getValidators("Inactive");

      expect(active.every((v) => v.status === "Active")).toBe(true);
      expect(inactive.every((v) => v.status === "Inactive")).toBe(true);
    });

    it("filters by multiple statuses", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const result = await service.getValidators(["Active", "Inactive"]);

      expect(result).toHaveLength(2);
    });
  });

  describe("getDelegations", () => {
    it("returns an active delegation when account is delegating", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);
      const active = delegations.filter((d) => d.status === "Active");

      expect(active).toHaveLength(1);
      expect(active[0].amount).toBe(BigInt(accountFixture.controlled_amount));
    });

    it("links the delegation to the correct validator", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);

      expect(delegations[0].validator.operatorAddress).toBe(accountFixture.pool_id);
    });

    it("returns no delegations when account is not delegating", async () => {
      const rpcClient = makeRpcClient({ account: { active: false, pool_id: null } });
      const service = new StakingService(new InMemoryCache(), rpcClient as any);

      const { delegations } = await service.getDelegations("stake1...");

      expect(delegations).toHaveLength(0);
    });

    it("creates an unknown validator placeholder for an unrecognised pool", async () => {
      const unknownPoolId = "pool1unknownpoolid0000000000000000000000000000000000000000";
      const rpcClient = makeRpcClient({ account: { pool_id: unknownPoolId } });
      const service = new StakingService(new InMemoryCache(), rpcClient as any);

      const { delegations } = await service.getDelegations("stake1...");
      const delegation = delegations.find((d) => d.status === "Active");

      expect(delegation).toBeDefined();
      expect(delegation!.validator.operatorAddress).toBe(unknownPoolId);
    });

    it("includes staking summary with totalProtocolStake", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      const expectedStake = Number(BigInt(networkFixture.stake.live) / 1_000_000n);
      expect(stakingSummary.totalProtocolStake).toBe(expectedStake);
    });

    it("includes staking summary with unboundPeriodInMillis = 0", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      expect(stakingSummary.unboundPeriodInMillis).toBe(0);
    });

    it("includes staking summary with redelegateFeeRate = 0", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      expect(stakingSummary.redelegateFeeRate).toBe(0);
    });

    it("counts only active validators in activeValidators", async () => {
      const service = new StakingService(new InMemoryCache(), makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      // 1 active pool (pool 1), 1 retiring pool (pool 2)
      expect(stakingSummary.activeValidators).toBe(1);
      expect(stakingSummary.totalValidators).toBe(2);
    });
  });
});
