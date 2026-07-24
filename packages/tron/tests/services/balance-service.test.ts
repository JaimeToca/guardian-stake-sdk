import { describe, it, expect, vi } from "vitest";
import { createBalanceService } from "../../src/tron-chain/services/balance-service";
import { ValidationError } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../../src/tron-chain/rpc/tron-rpc-client-contract";

const TEST_ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

/** Minimal RPC mock: only the methods balance-service actually calls. */
function makeBalanceRpc(
  partial: Pick<TronRpcClientContract, "getAccount" | "getReward">
): TronRpcClientContract {
  return partial as unknown as TronRpcClientContract;
}

describe("getBalances", () => {
  it("maps to Available/Staked/Pending/Claimable/Rewards without double counting", async () => {
    const now = Date.now();
    const rpc = makeBalanceRpc({
      getAccount: vi.fn().mockResolvedValue({
        balance: 5_000_000n,
        frozen: [
          { resource: "BANDWIDTH", amount: 100_000_000n },
          { resource: "ENERGY", amount: 50_000_000n },
        ],
        unfreezing: [
          { resource: "BANDWIDTH", amount: 40_000_000n, expireTime: now + 1_000_000 },
          { resource: "ENERGY", amount: 10_000_000n, expireTime: now - 1_000_000 },
        ],
        votes: [],
      }),
      getReward: vi.fn().mockResolvedValue(7_000_000n),
    });
    const balances = await createBalanceService(rpc).getBalances(TEST_ADDRESS);
    const by = (t: string) => balances.find((b) => b.type === t)?.amount;
    expect(by("Available")).toBe(5_000_000n);
    expect(by("Staked")).toBe(150_000_000n);
    expect(by("Pending")).toBe(40_000_000n);
    expect(by("Claimable")).toBe(10_000_000n);
    expect(by("Rewards")).toBe(7_000_000n);
  });

  it("throws ValidationError(INVALID_ADDRESS) for a malformed address, before hitting the RPC", async () => {
    const getAccount = vi.fn();
    const getReward = vi.fn();
    const rpc = makeBalanceRpc({ getAccount, getReward });

    await expect(createBalanceService(rpc).getBalances("TWallet")).rejects.toMatchObject({
      code: "INVALID_ADDRESS",
    });
    await expect(createBalanceService(rpc).getBalances("TWallet")).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(getAccount).not.toHaveBeenCalled();
    expect(getReward).not.toHaveBeenCalled();
  });
});
