import { describe, it, expect, vi } from "vitest";
import { BalanceService } from "../../src/cardano-chain/services/balance-service";
import accountFixture from "../fixtures/account.json";
import type { BlockfrostAccount } from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

function makeRpcClient(account: Partial<BlockfrostAccount> = {}) {
  return {
    getAccount: vi.fn().mockResolvedValue({ ...accountFixture, ...account }),
  };
}

describe("BalanceService", () => {
  const STAKE_ADDRESS = accountFixture.stake_address;

  it("returns Available, Staked, and Claimable balance types (no Pending — Cardano has no unbonding)", async () => {
    const service = new BalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const types = balances.map((b) => b.type);

    expect(types).toContain("Available");
    expect(types).toContain("Staked");
    expect(types).toContain("Claimable");
    expect(types).not.toContain("Pending");
  });

  it("returns exactly 3 balance entries", async () => {
    const service = new BalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);

    expect(balances).toHaveLength(3);
  });

  it("maps Available balance from controlled_amount", async () => {
    const service = new BalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const available = balances.find((b) => b.type === "Available");

    expect(available?.amount).toBe(BigInt(accountFixture.controlled_amount));
  });

  it("maps Staked balance equal to controlled_amount (ADA is never locked by delegation)", async () => {
    const service = new BalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const staked = balances.find((b) => b.type === "Staked");

    expect(staked?.amount).toBe(BigInt(accountFixture.controlled_amount));
  });

  it("maps Claimable balance from withdrawable_amount", async () => {
    const service = new BalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const claimable = balances.find((b) => b.type === "Claimable");

    expect(claimable?.amount).toBe(BigInt(accountFixture.withdrawable_amount));
  });

  it("returns zero claimable when withdrawable_amount is 0", async () => {
    const service = new BalanceService(makeRpcClient({ withdrawable_amount: "0" }) as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const claimable = balances.find((b) => b.type === "Claimable");

    expect(claimable?.amount).toBe(0n);
  });

  it("reflects large balances correctly (bigint precision)", async () => {
    const largeAmount = "45000000000000000"; // 45 billion ADA in lovelaces
    const service = new BalanceService(
      makeRpcClient({ controlled_amount: largeAmount, withdrawable_amount: "0" }) as any
    );

    const balances = await service.getBalances(STAKE_ADDRESS);
    const available = balances.find((b) => b.type === "Available");

    expect(available?.amount).toBe(BigInt(largeAmount));
  });
});
