import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { BalanceService } from "../../src/smartchain/services/balance-service";
import { BalanceType, DelegationStatus } from "@guardian/sdk";

const mockAddress = getAddress("0x1234567890123456789012345678901234567890");

const mockStakingSummary = {
  totalProtocolStake: 0,
  maxApy: 0,
  minAmountToStake: 0n,
  unboundPeriodInMillis: 0,
  redelegateFeeRate: 0,
  activeValidators: 0,
  totalValidators: 0,
};

function makeStakingService(delegations: any[]) {
  return {
    getValidators: async () => [],
    getDelegations: async () => ({
      delegations,
      stakingSummary: mockStakingSummary,
    }),
  };
}

function makePublicClient(balance: bigint) {
  return {
    getBalance: async () => balance,
  };
}

describe("BalanceService", () => {
  it("returns all four balance types", async () => {
    const service = new BalanceService(
      makePublicClient(100n) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);
    const types = balances.map((b) => b.type);

    expect(types).toContain(BalanceType.Available);
    expect(types).toContain(BalanceType.Staked);
    expect(types).toContain(BalanceType.Pending);
    expect(types).toContain(BalanceType.Claimable);
  });

  it("maps the available balance from the client", async () => {
    const service = new BalanceService(
      makePublicClient(500n) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);
    const available = balances.find((b) => b.type === BalanceType.Available);

    expect(available?.amount).toBe(500n);
  });

  it("aggregates staked balance from active delegations", async () => {
    const delegations = [
      { status: DelegationStatus.Active, amount: 100n },
      { status: DelegationStatus.Active, amount: 200n },
    ];

    const service = new BalanceService(
      makePublicClient(0n) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const staked = balances.find((b) => b.type === BalanceType.Staked);

    expect(staked?.amount).toBe(300n);
  });

  it("aggregates pending balance from pending delegations", async () => {
    const delegations = [
      { status: DelegationStatus.Pending, amount: 50n },
      { status: DelegationStatus.Pending, amount: 75n },
    ];

    const service = new BalanceService(
      makePublicClient(0n) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const pending = balances.find((b) => b.type === BalanceType.Pending);

    expect(pending?.amount).toBe(125n);
  });

  it("aggregates claimable balance from claimable delegations", async () => {
    const delegations = [
      { status: DelegationStatus.Claimable, amount: 300n },
    ];

    const service = new BalanceService(
      makePublicClient(0n) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const claimable = balances.find((b) => b.type === BalanceType.Claimable);

    expect(claimable?.amount).toBe(300n);
  });

  it("correctly buckets mixed delegation statuses", async () => {
    const delegations = [
      { status: DelegationStatus.Active, amount: 100n },
      { status: DelegationStatus.Pending, amount: 50n },
      { status: DelegationStatus.Claimable, amount: 25n },
      { status: DelegationStatus.Inactive, amount: 10n },
    ];

    const service = new BalanceService(
      makePublicClient(1000n) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);

    expect(balances.find((b) => b.type === BalanceType.Available)?.amount).toBe(1000n);
    expect(balances.find((b) => b.type === BalanceType.Staked)?.amount).toBe(110n);
    expect(balances.find((b) => b.type === BalanceType.Pending)?.amount).toBe(50n);
    expect(balances.find((b) => b.type === BalanceType.Claimable)?.amount).toBe(25n);
  });

  it("returns zero for all staking balances when there are no delegations", async () => {
    const service = new BalanceService(
      makePublicClient(0n) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);

    expect(balances.find((b) => b.type === BalanceType.Staked)?.amount).toBe(0n);
    expect(balances.find((b) => b.type === BalanceType.Pending)?.amount).toBe(0n);
    expect(balances.find((b) => b.type === BalanceType.Claimable)?.amount).toBe(0n);
  });
});
