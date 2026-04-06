import { describe, it, expect } from "vitest";
import { getAddress } from "viem";
import { BalanceService } from "../../src/smartchain/services/balance-service";
import getBalanceFixture from "../fixtures/eth_getBalance.json";

const REAL_BALANCE = BigInt(getBalanceFixture.result);

const mockAddress = getAddress("0x773760b0708a5cc369c346993a0c225d8e4043b1");

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
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);
    const types = balances.map((b) => b.type);

    expect(types).toContain("Available");
    expect(types).toContain("Staked");
    expect(types).toContain("Pending");
    expect(types).toContain("Claimable");
  });

  it("maps the available balance from the rpc response", async () => {
    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);
    const available = balances.find((b) => b.type === "Available");

    expect(available?.amount).toBe(REAL_BALANCE);
  });

  it("aggregates staked balance from active delegations", async () => {
    const delegations = [
      { status: "Active", amount: 100n },
      { status: "Active", amount: 200n },
    ];

    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const staked = balances.find((b) => b.type === "Staked");

    expect(staked?.amount).toBe(300n);
  });

  it("aggregates pending balance from pending delegations", async () => {
    const delegations = [
      { status: "Pending", amount: 50n },
      { status: "Pending", amount: 75n },
    ];

    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const pending = balances.find((b) => b.type === "Pending");

    expect(pending?.amount).toBe(125n);
  });

  it("aggregates claimable balance from claimable delegations", async () => {
    const delegations = [{ status: "Claimable", amount: 300n }];

    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);
    const claimable = balances.find((b) => b.type === "Claimable");

    expect(claimable?.amount).toBe(300n);
  });

  it("correctly buckets mixed delegation statuses", async () => {
    const delegations = [
      { status: "Active", amount: 100n },
      { status: "Pending", amount: 50n },
      { status: "Claimable", amount: 25n },
      { status: "Inactive", amount: 10n },
    ];

    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService(delegations) as any
    );

    const balances = await service.getBalances(mockAddress);

    expect(balances.find((b) => b.type === "Available")?.amount).toBe(REAL_BALANCE);
    expect(balances.find((b) => b.type === "Staked")?.amount).toBe(110n);
    expect(balances.find((b) => b.type === "Pending")?.amount).toBe(50n);
    expect(balances.find((b) => b.type === "Claimable")?.amount).toBe(25n);
  });

  it("returns zero for all staking balances when there are no delegations", async () => {
    const service = new BalanceService(
      makePublicClient(REAL_BALANCE) as any,
      makeStakingService([]) as any
    );

    const balances = await service.getBalances(mockAddress);

    expect(balances.find((b) => b.type === "Staked")?.amount).toBe(0n);
    expect(balances.find((b) => b.type === "Pending")?.amount).toBe(0n);
    expect(balances.find((b) => b.type === "Claimable")?.amount).toBe(0n);
  });
});
