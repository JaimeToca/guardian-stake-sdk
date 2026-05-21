import { describe, it, expect, vi } from "vitest";
import { createStakingService } from "../../src/cardano-chain/services/staking-service";
import poolsFixture from "../fixtures/pools.json";
import poolMetadataFixture from "../fixtures/pool_metadata.json";
import accountFixture from "../fixtures/account.json";
import networkFixture from "../fixtures/network.json";
import protocolParamsFixture from "../fixtures/protocol_params.json";
import type {
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostAccount,
  BlockfrostNetwork,
  BlockfrostProtocolParams,
} from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

const POOLS = poolsFixture as BlockfrostPoolExtended[];
const POOL_1_ID = POOLS[0].pool_id;

function makeRpcClient(
  overrides: {
    pools?: BlockfrostPoolExtended[];
    metadata?: BlockfrostPoolMetadata | null;
    account?: Partial<BlockfrostAccount>;
    network?: BlockfrostNetwork;
    protocolParams?: BlockfrostProtocolParams;
  } = {}
) {
  const pools = overrides.pools ?? POOLS;
  const metadataResult =
    overrides.metadata !== undefined
      ? overrides.metadata
      : (poolMetadataFixture as BlockfrostPoolMetadata);
  const account = { ...accountFixture, ...overrides.account } as BlockfrostAccount;
  const network = overrides.network ?? (networkFixture as BlockfrostNetwork);
  const protocolParams =
    overrides.protocolParams ?? (protocolParamsFixture as BlockfrostProtocolParams);

  return {
    getPools: vi.fn().mockImplementation((page = 1, pageSize = 20) => {
      const start = (page - 1) * pageSize;
      return Promise.resolve(pools.slice(start, start + pageSize));
    }),
    getPool: vi.fn().mockImplementation((poolId: string) => {
      const found = pools.find((p) => p.pool_id === poolId);
      return Promise.resolve(found ?? { ...pools[0], pool_id: poolId });
    }),
    getPoolMetadata: vi.fn().mockResolvedValue(metadataResult),
    getAccount: vi.fn().mockResolvedValue(account),
    getNetwork: vi.fn().mockResolvedValue(network),
    getProtocolParams: vi.fn().mockResolvedValue(protocolParams),
    getUtxos: vi.fn(),
    submitTx: vi.fn(),
  };
}

describe("StakingService", () => {
  describe("getValidators", () => {
    it("fetches pools from RPC on the first call", async () => {
      const rpcClient = makeRpcClient();
      const service = createStakingService(rpcClient as any);

      await service.getValidators();

      expect(rpcClient.getPools).toHaveBeenCalledTimes(1);
    });

    it("calls getPools with the correct page and pageSize", async () => {
      const rpcClient = makeRpcClient();
      const service = createStakingService(rpcClient as any);

      await service.getValidators({ page: 2, pageSize: 10 });

      expect(rpcClient.getPools).toHaveBeenCalledWith(2, 10);
    });

    it("maps an active pool (no retirement) to status Active", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();
      const active = data.find((v) => v.operatorAddress === POOL_1_ID);

      expect(active).toBeDefined();
      expect(active!.status).toBe("Active");
    });

    it("maps a retiring pool to status Inactive", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();
      const retiring = data.find((v) => v.operatorAddress === POOLS[1].pool_id);

      expect(retiring).toBeDefined();
      expect(retiring!.status).toBe("Inactive");
    });

    it("uses metadata name when available", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();
      const pool1 = data.find((v) => v.operatorAddress === POOL_1_ID);

      // Pool 1 has metadata with name "StakeNuts" (from pool_metadata.json fixture)
      expect(pool1!.name).toBe("StakeNuts");
    });

    it("falls back to pool_id prefix when metadata is null", async () => {
      const rpcClient = makeRpcClient({ metadata: null });
      const service = createStakingService(rpcClient as any);

      const { data } = await service.getValidators();
      const pool1 = data.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.name).toBe(POOL_1_ID.slice(0, 16) + "...");
    });

    it("returns two validators matching the fixture", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();

      expect(data).toHaveLength(2);
    });

    it("sets operatorAddress and creditAddress to the pool bech32 ID", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();
      const pool1 = data.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.operatorAddress).toBe(POOL_1_ID);
      expect(pool1!.creditAddress).toBe(POOL_1_ID);
    });

    it("reports a positive APY for a non-saturated pool with margin < 100%", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { data } = await service.getValidators();
      const pool1 = data.find((v) => v.operatorAddress === POOL_1_ID);

      expect(pool1!.apy).toBeGreaterThan(0);
    });

    it("returns correct pagination metadata", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { pagination } = await service.getValidators({ page: 1, pageSize: 1 });

      expect(pagination.page).toBe(1);
      expect(pagination.pageSize).toBe(1);
      expect(pagination.total).toBeUndefined();
      expect(pagination.totalPages).toBeUndefined();
      expect(pagination.hasNextPage).toBe(true); // fixture has 2 pools, pageSize 1 → full page returned
    });

    it("respects page and pageSize params", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const page1 = await service.getValidators({ page: 1, pageSize: 1 });
      const page2 = await service.getValidators({ page: 2, pageSize: 1 });

      expect(page1.data).toHaveLength(1);
      expect(page2.data).toHaveLength(1);
      expect(page1.data[0].id).not.toBe(page2.data[0].id);
    });
  });

  describe("getDelegations", () => {
    it("returns an active delegation when account is delegating", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);
      const active = delegations.filter((d) => d.status === "Active");

      expect(active).toHaveLength(1);
      expect(active[0].amount).toBe(BigInt(accountFixture.controlled_amount));
    });

    it("links the delegation to the correct validator", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);

      expect(delegations[0].validator.operatorAddress).toBe(accountFixture.pool_id);
    });

    it("returns no delegations when account is not delegating", async () => {
      const rpcClient = makeRpcClient({ account: { active: false, pool_id: null } });
      const service = createStakingService(rpcClient as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);

      expect(delegations).toHaveLength(0);
    });

    it("creates an unknown validator placeholder for an unrecognised pool", async () => {
      const unknownPoolId = "pool1unknownpoolid0000000000000000000000000000000000000000";
      const rpcClient = makeRpcClient({ account: { pool_id: unknownPoolId } });
      const service = createStakingService(rpcClient as any);

      const { delegations } = await service.getDelegations(accountFixture.stake_address);
      const delegation = delegations.find((d) => d.status === "Active");

      expect(delegation).toBeDefined();
      expect(delegation!.validator.operatorAddress).toBe(unknownPoolId);
    });

    it("includes staking summary with totalProtocolStake", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      const expectedStake = Number(BigInt(networkFixture.stake.live) / 1_000_000n);
      expect(stakingSummary.totalProtocolStake).toBe(expectedStake);
    });

    it("includes staking summary with unboundPeriodInMillis = 0", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      expect(stakingSummary.unboundPeriodInMillis).toBe(0);
    });

    it("includes staking summary with redelegateFeeRate = 0", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      expect(stakingSummary.redelegateFeeRate).toBe(0);
    });

    it("returns undefined for activeValidators and totalValidators (not available from getDelegations — use getValidators())", async () => {
      const service = createStakingService(makeRpcClient() as any);

      const { stakingSummary } = await service.getDelegations(accountFixture.stake_address);

      expect(stakingSummary.activeValidators).toBeUndefined();
      expect(stakingSummary.totalValidators).toBeUndefined();
    });
  });
});
