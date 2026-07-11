import { describe, it, expect, vi, afterEach } from "vitest";
import { createTronRpcClient } from "../../src/tron-chain/rpc/tron-rpc-client";

function mockFetch(json: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => json });
}
afterEach(() => vi.unstubAllGlobals());

describe("createTronRpcClient.getAccount", () => {
  it("maps balance, frozenV2, unfrozenV2, votes into SUN bigints", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        balance: 5_000_000,
        frozenV2: [
          { amount: 100_000_000 },
          { type: "ENERGY", amount: 50_000_000 },
          { type: "TRON_POWER" },
        ],
        unfrozenV2: [{ unfreeze_amount: 40_000_000, unfreeze_expire_time: 1893456000000 }],
        votes: [{ vote_address: "TSRxxx", vote_count: 100 }],
      })
    );
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.balance).toBe(5_000_000n);
    expect(acct.frozen).toEqual([
      { resource: "BANDWIDTH", amount: 100_000_000n },
      { resource: "ENERGY", amount: 50_000_000n },
    ]);
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: 1893456000000 }]);
    expect(acct.votes).toEqual([{ srAddress: "TSRxxx", votes: 100n }]);
  });
});

describe("createTronRpcClient.getReward", () => {
  it("returns reward in SUN, 0 when absent", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const rpc = createTronRpcClient("https://node.example");
    expect(await rpc.getReward("TWallet")).toBe(0n);
  });
});
