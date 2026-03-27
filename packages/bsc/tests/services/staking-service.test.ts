import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { StakingService } from "../../src/smartchain/services/staking-service";
import { InMemoryCache, DelegationStatus, ValidatorStatus } from "@guardian/sdk";

const mockValidator = {
  id: "validator_0",
  status: ValidatorStatus.Active,
  name: "Test Validator",
  description: "ACTIVE",
  image: undefined,
  apy: 5,
  delegators: 100,
  operatorAddress: getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
  creditAddress: getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"),
};

const mockStakingSummary = {
  totalStaked: 1000n,
  maxApy: 0.05,
  activeValidators: 10,
  totalValidators: 15,
};

function makeBNBRpcClient(validators: any[] = [], summary = mockStakingSummary) {
  return {
    getValidators: vi.fn().mockResolvedValue(validators),
    getStakingSummary: vi.fn().mockResolvedValue(summary),
  };
}

function makeStakingRpcClient(
  creditContracts: Map<string, string> = new Map(),
  pooledBNBData: any[] = [],
  pendingUnbond: any[] = []
) {
  return {
    getCreditContractValidators: vi.fn().mockResolvedValue(creditContracts),
    getPooledBNBData: vi.fn().mockResolvedValue(pooledBNBData),
    getPendingUnbondDelegation: vi.fn().mockResolvedValue(pendingUnbond),
    getUnbondRequestData: vi.fn(),
  };
}

const delegatorAddress = getAddress("0x1234567890123456789012345678901234567890");

describe("StakingService", () => {
  describe("getValidators", () => {
    it("fetches validators from RPC on first call", async () => {
      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Test Validator",
          status: "ACTIVE",
          miningStatus: "Active",
          apy: 0.05,
          delegatorCount: 100,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]])
      );
      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      await service.getValidators();

      expect(bnbRpcClient.getValidators).toHaveBeenCalledTimes(1);
    });

    it("returns cached validators on second call without hitting RPC", async () => {
      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Test Validator",
          status: "ACTIVE",
          miningStatus: "Active",
          apy: 0.05,
          delegatorCount: 100,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]])
      );
      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      await service.getValidators();
      await service.getValidators();

      expect(bnbRpcClient.getValidators).toHaveBeenCalledTimes(1);
    });

    it("maps INACTIVE bnb status to ValidatorStatus.Inactive", async () => {
      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Inactive Val",
          status: "INACTIVE",
          miningStatus: "Inactive",
          apy: 0,
          delegatorCount: 0,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]])
      );
      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      const validators = await service.getValidators();

      expect(validators[0].status).toBe(ValidatorStatus.Inactive);
    });

    it("maps JAILED bnb status to ValidatorStatus.Jailed", async () => {
      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Jailed Val",
          status: "JAILED",
          miningStatus: "Jailed",
          apy: 0,
          delegatorCount: 0,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]])
      );
      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      const validators = await service.getValidators();

      expect(validators[0].status).toBe(ValidatorStatus.Jailed);
    });
  });

  describe("getDelegations", () => {
    it("returns active delegations with non-zero pooled BNB", async () => {
      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Test Validator",
          status: "ACTIVE",
          miningStatus: "Active",
          apy: 0.05,
          delegatorCount: 100,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]]),
        [{ status: "success", result: 500n }],
        [{ status: "success", result: 0n }]
      );
      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      const result = await service.getDelegations(delegatorAddress);
      const activeDelegations = result.delegations.filter(
        (d) => d.status === DelegationStatus.Active
      );

      expect(activeDelegations).toHaveLength(1);
      expect(activeDelegations[0].amount).toBe(500n);
    });

    it("marks an unbond as Pending when unlock time is in the future", async () => {
      const futureUnlockTime = BigInt(Math.floor(Date.now() / 1000) + 86400);

      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Test Validator",
          status: "ACTIVE",
          miningStatus: "Active",
          apy: 0.05,
          delegatorCount: 100,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]]),
        [{ status: "success", result: 0n }],
        [{ status: "success", result: 1n }]
      );
      stakingRpcClient.getUnbondRequestData = vi.fn().mockResolvedValue({
        amount: 200n,
        unlockTime: futureUnlockTime,
      });

      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      const result = await service.getDelegations(delegatorAddress);
      const pending = result.delegations.filter((d) => d.status === DelegationStatus.Pending);

      expect(pending).toHaveLength(1);
      expect(pending[0].amount).toBe(200n);
    });

    it("marks an unbond as Claimable when unlock time has passed", async () => {
      const pastUnlockTime = BigInt(Math.floor(Date.now() / 1000) - 86400);

      const bnbRpcClient = makeBNBRpcClient([
        {
          moniker: "Test Validator",
          status: "ACTIVE",
          miningStatus: "Active",
          apy: 0.05,
          delegatorCount: 100,
          operatorAddress: mockValidator.operatorAddress,
        },
      ]);
      const stakingRpcClient = makeStakingRpcClient(
        new Map([[mockValidator.operatorAddress, mockValidator.creditAddress]]),
        [{ status: "success", result: 0n }],
        [{ status: "success", result: 1n }]
      );
      stakingRpcClient.getUnbondRequestData = vi.fn().mockResolvedValue({
        amount: 150n,
        unlockTime: pastUnlockTime,
      });

      const cache = new InMemoryCache<string, any[]>();
      const service = new StakingService(cache, stakingRpcClient as any, bnbRpcClient as any);

      const result = await service.getDelegations(delegatorAddress);
      const claimable = result.delegations.filter((d) => d.status === DelegationStatus.Claimable);

      expect(claimable).toHaveLength(1);
      expect(claimable[0].amount).toBe(150n);
    });
  });
});
