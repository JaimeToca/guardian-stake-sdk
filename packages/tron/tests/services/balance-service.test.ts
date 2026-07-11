import { describe, it, expect, vi } from "vitest";
import { createBalanceService } from "../../src/tron-chain/services/balance-service";

describe("getBalances", () => {
  it("maps to Available/Staked/Pending/Claimable/Rewards without double counting", async () => {
    const now = Date.now();
    const rpc = {
      getAccount: vi.fn().mockResolvedValue({
        balance: 5_000_000n,
        frozen: [
          { resource: "BANDWIDTH", amount: 100_000_000n },
          { resource: "ENERGY", amount: 50_000_000n },
        ],
        unfreezing: [
          { amount: 40_000_000n, expireTime: now + 1_000_000 },
          { amount: 10_000_000n, expireTime: now - 1_000_000 },
        ],
        votes: [],
      }),
      getReward: vi.fn().mockResolvedValue(7_000_000n),
    } as any;
    const balances = await createBalanceService(rpc).getBalances("TWallet");
    const by = (t: string) => balances.find((b) => b.type === t)?.amount;
    expect(by("Available")).toBe(5_000_000n);
    expect(by("Staked")).toBe(150_000_000n);
    expect(by("Pending")).toBe(40_000_000n);
    expect(by("Claimable")).toBe(10_000_000n);
    expect(by("Rewards")).toBe(7_000_000n);
  });
});
