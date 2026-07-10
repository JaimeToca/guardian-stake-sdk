import { describe, it, expect, vi } from "vitest";
import { createBalanceService } from "../../src/cardano-chain/services/balance-service";
import accountFixture from "../fixtures/account.json";
import type { BlockfrostAccount } from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

function makeRpcClient(account: Partial<BlockfrostAccount> = {}) {
  return {
    getAccount: vi.fn().mockResolvedValue({ ...accountFixture, ...account }),
  };
}

describe("BalanceService", () => {
  const STAKE_ADDRESS = accountFixture.stake_address;

  it("returns Available, Staked, and Rewards balance types (no Pending — Cardano has no unbonding)", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const types = balances.map((b) => b.type);

    expect(types).toContain("Available");
    expect(types).toContain("Staked");
    expect(types).toContain("Rewards");
    expect(types).not.toContain("Pending");
  });

  it("returns exactly 3 balance entries", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);

    expect(balances).toHaveLength(3);
  });

  // controlled_amount already includes withdrawable_amount (rewards), so Available
  // is the wallet balance net of rewards — avoids double-counting against "Rewards".
  const WALLET_AMOUNT =
    BigInt(accountFixture.controlled_amount) - BigInt(accountFixture.withdrawable_amount);

  it("maps Available balance to controlled_amount minus rewards (no double-count)", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const available = balances.find((b) => b.type === "Available");

    expect(available?.amount).toBe(WALLET_AMOUNT);
  });

  it("Available + Rewards equals the total controlled amount", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const available = balances.find((b) => b.type === "Available")?.amount ?? 0n;
    const rewards = balances.find((b) => b.type === "Rewards")?.amount ?? 0n;

    expect(available + rewards).toBe(BigInt(accountFixture.controlled_amount));
  });

  it("sets Staked = wallet balance (controlled minus rewards) when delegated", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const staked = balances.find((b) => b.type === "Staked");

    expect(staked?.amount).toBe(WALLET_AMOUNT);
  });

  it("sets Staked = 0 when not delegated (pool_id is null)", async () => {
    const service = createBalanceService(makeRpcClient({ pool_id: null }) as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const staked = balances.find((b) => b.type === "Staked");

    expect(staked?.amount).toBe(0n);
  });

  it("maps Rewards balance from withdrawable_amount", async () => {
    const service = createBalanceService(makeRpcClient() as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const claimable = balances.find((b) => b.type === "Rewards");

    expect(claimable?.amount).toBe(BigInt(accountFixture.withdrawable_amount));
  });

  it("returns zero rewards when withdrawable_amount is 0", async () => {
    const service = createBalanceService(makeRpcClient({ withdrawable_amount: "0" }) as any);

    const balances = await service.getBalances(STAKE_ADDRESS);
    const claimable = balances.find((b) => b.type === "Rewards");

    expect(claimable?.amount).toBe(0n);
  });

  it("reflects large balances correctly (bigint precision)", async () => {
    const largeAmount = "45000000000000000"; // 45 billion ADA in lovelaces
    const service = createBalanceService(
      makeRpcClient({ controlled_amount: largeAmount, withdrawable_amount: "0" }) as any
    );

    const balances = await service.getBalances(STAKE_ADDRESS);
    const available = balances.find((b) => b.type === "Available");

    expect(available?.amount).toBe(BigInt(largeAmount));
  });
});
