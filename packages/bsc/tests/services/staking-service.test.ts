import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { StakingService } from "../../src/smartchain/services/staking-service";
import { InMemoryCache } from "@guardian/sdk";
import validatorsFixture from "../fixtures/bnb_validators.json";
import summaryFixture from "../fixtures/bnb_staking_summary.json";
import creditContractsFixture from "../fixtures/staking_credit_contracts.json";

// Parse fixtures into the shapes the RPC clients return
const VALIDATORS = validatorsFixture.data.validators;
const SUMMARY = summaryFixture.data.summary;
const CREDIT_MAP = new Map(
  creditContractsFixture.map(({ operator, credit }) => [getAddress(operator), getAddress(credit)])
);

const delegatorAddress = getAddress("0x8894e0a0c962cb723c1976a4421c95949be2d4e1");

function makeBNBRpcClient(
  overrides: { validators?: any[]; status?: "ACTIVE" | "INACTIVE" | "JAILED" } = {}
) {
  const validators = overrides.validators ?? VALIDATORS;
  const mapped = overrides.status
    ? validators.map((v) => ({ ...v, status: overrides.status }))
    : validators;

  return {
    getValidators: vi.fn().mockResolvedValue(mapped),
    getStakingSummary: vi.fn().mockResolvedValue(SUMMARY),
  };
}

function makeStakingRpcClient(
  creditContracts: Map<string, string> = CREDIT_MAP,
  pooledBNBData: any[] = VALIDATORS.map(() => ({ status: "success", result: 0n })),
  pendingUnbond: any[] = VALIDATORS.map(() => ({ status: "success", result: 0n }))
) {
  return {
    getCreditContractValidators: vi.fn().mockResolvedValue(creditContracts),
    getPooledBNBData: vi.fn().mockResolvedValue(pooledBNBData),
    getPendingUnbondDelegation: vi.fn().mockResolvedValue(pendingUnbond),
    getUnbondRequestData: vi.fn(),
  };
}

describe("StakingService", () => {
  describe("getValidators", () => {
    it("fetches validators from RPC on first call", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      await service.getValidators();

      expect(bnbRpcClient.getValidators).toHaveBeenCalledTimes(1);
    });

    it("returns cached validators on second call without hitting RPC", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      await service.getValidators();
      await service.getValidators();

      expect(bnbRpcClient.getValidators).toHaveBeenCalledTimes(1);
    });

    it("maps real validator fields correctly", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const validators = await service.getValidators();

      expect(validators).toHaveLength(3);
      expect(validators[0].name).toBe("TWStaking");
      expect(validators[0].status).toBe("Active");
      expect(validators[0].operatorAddress).toBe(
        getAddress("0x5c38FF8Ca2b16099C086bF36546e99b13D152C4c")
      );
      expect(validators[0].creditAddress).toBe(
        getAddress("0xc437593d9c296bf9a5002522a86dad8a4d4af808")
      );
      expect(validators[0].apy).toBeCloseTo(VALIDATORS[0].apy! * 100, 5);
    });

    it('maps INACTIVE status to "Inactive"', async () => {
      const bnbRpcClient = makeBNBRpcClient({ status: "INACTIVE" });
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const validators = await service.getValidators();

      validators.forEach((v) => expect(v.status).toBe("Inactive"));
    });

    it('maps JAILED status to "Jailed"', async () => {
      const bnbRpcClient = makeBNBRpcClient({ status: "JAILED" });
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const validators = await service.getValidators();

      validators.forEach((v) => expect(v.status).toBe("Jailed"));
    });

    it("skips validators with no matching credit address", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      // Only include the first validator in the credit map
      const partialMap = new Map([
        [
          getAddress("0x5c38FF8Ca2b16099C086bF36546e99b13D152C4c"),
          getAddress("0xc437593d9c296bf9a5002522a86dad8a4d4af808"),
        ],
      ]);
      const stakingRpcClient = makeStakingRpcClient(partialMap as any);
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const validators = await service.getValidators();

      expect(validators).toHaveLength(1);
      expect(validators[0].name).toBe("TWStaking");
    });
  });

  describe("getDelegations", () => {
    it("returns active delegations with non-zero pooled BNB", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient(
        CREDIT_MAP,
        [
          { status: "success", result: 5_000_000_000_000_000_000n }, // 5 BNB in TWStaking
          { status: "success", result: 0n },
          { status: "success", result: 0n },
        ],
        VALIDATORS.map(() => ({ status: "success", result: 0n }))
      );
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const result = await service.getDelegations(delegatorAddress);
      const active = result.delegations.filter((d) => d.status === "Active");

      expect(active).toHaveLength(1);
      expect(active[0].amount).toBe(5_000_000_000_000_000_000n);
      expect(active[0].validator.name).toBe("TWStaking");
    });

    it("marks an unbond as Pending when unlock time is in the future", async () => {
      const futureUnlockTime = BigInt(Math.floor(Date.now() / 1000) + 86400);
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient(
        CREDIT_MAP,
        VALIDATORS.map(() => ({ status: "success", result: 0n })),
        [
          { status: "success", result: 1n }, // 1 unbond request in TWStaking
          { status: "success", result: 0n },
          { status: "success", result: 0n },
        ]
      );
      stakingRpcClient.getUnbondRequestData = vi.fn().mockResolvedValue({
        amount: 2_000_000_000_000_000_000n, // 2 BNB
        unlockTime: futureUnlockTime,
      });
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const result = await service.getDelegations(delegatorAddress);
      const pending = result.delegations.filter((d) => d.status === "Pending");

      expect(pending).toHaveLength(1);
      expect(pending[0].amount).toBe(2_000_000_000_000_000_000n);
    });

    it("marks an unbond as Claimable when unlock time has passed", async () => {
      const pastUnlockTime = BigInt(Math.floor(Date.now() / 1000) - 86400);
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient(
        CREDIT_MAP,
        VALIDATORS.map(() => ({ status: "success", result: 0n })),
        [
          { status: "success", result: 0n },
          { status: "success", result: 1n }, // 1 unbond request in Namelix
          { status: "success", result: 0n },
        ]
      );
      stakingRpcClient.getUnbondRequestData = vi.fn().mockResolvedValue({
        amount: 1_500_000_000_000_000_000n, // 1.5 BNB
        unlockTime: pastUnlockTime,
      });
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const result = await service.getDelegations(delegatorAddress);
      const claimable = result.delegations.filter((d) => d.status === "Claimable");

      expect(claimable).toHaveLength(1);
      expect(claimable[0].amount).toBe(1_500_000_000_000_000_000n);
      expect(claimable[0].validator.name).toBe("Namelix");
    });

    it("exposes real staking summary from the API fixture", async () => {
      const bnbRpcClient = makeBNBRpcClient();
      const stakingRpcClient = makeStakingRpcClient();
      const service = new StakingService(
        new InMemoryCache(),
        stakingRpcClient as any,
        bnbRpcClient as any
      );

      const result = await service.getDelegations(delegatorAddress);

      expect(result.stakingSummary.activeValidators).toBe(SUMMARY.activeValidators);
      expect(result.stakingSummary.totalValidators).toBe(SUMMARY.totalValidators);
      expect(result.stakingSummary.maxApy).toBeCloseTo(SUMMARY.maxApy * 100, 5);
    });
  });
});
