import { describe, it, expect, vi, afterEach } from "vitest";
import { createTronRpcClient } from "../../src/tron-chain/rpc/tron-rpc-client";

function mockFetch(json: unknown) {
  const body = JSON.stringify(json);
  return vi.fn().mockResolvedValue({ ok: true, text: async () => body });
}
afterEach(() => vi.unstubAllGlobals());

function mockFetchRaw(text: string) {
  return vi.fn().mockResolvedValue({ ok: true, text: async () => text });
}

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

  it("preserves int64 precision beyond Number.MAX_SAFE_INTEGER for balance and frozen amounts", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetchRaw(
        `{"balance":9007199254740993,"frozenV2":[{"amount":9007199254740995}],"unfrozenV2":[],"votes":[]}`
      )
    );
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.balance).toBe(9007199254740993n);
    expect(acct.frozen).toEqual([{ resource: "BANDWIDTH", amount: 9007199254740995n }]);
  });

  it("maps a missing unfreeze_expire_time to the far-future Pending sentinel", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        balance: 0,
        frozenV2: [],
        unfrozenV2: [{ unfreeze_amount: 40_000_000 }],
        votes: [],
      })
    );
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: Number.MAX_SAFE_INTEGER }]);
  });

  it("maps a non-positive unfreeze_expire_time to the far-future Pending sentinel", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        balance: 0,
        frozenV2: [],
        unfrozenV2: [{ unfreeze_amount: 40_000_000, unfreeze_expire_time: 0 }],
        votes: [],
      })
    );
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: Number.MAX_SAFE_INTEGER }]);
  });
});

describe("createTronRpcClient.getReward", () => {
  it("returns reward in SUN, 0 when absent", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const rpc = createTronRpcClient("https://node.example");
    expect(await rpc.getReward("TWallet")).toBe(0n);
  });
});

describe("createTronRpcClient.getAccountResources", () => {
  it("computes freeBandwidth/stakedBandwidth from limit-used pairs", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        freeNetLimit: 5000,
        freeNetUsed: 1200,
        NetLimit: 2000,
        NetUsed: 500,
      })
    );
    const rpc = createTronRpcClient("https://node.example");
    const res = await rpc.getAccountResources("TWallet");
    expect(res).toEqual({ freeBandwidth: 3800n, stakedBandwidth: 1500n });
  });

  it("clamps to 0 when used exceeds limit, and defaults missing fields to 0", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        freeNetLimit: 100,
        freeNetUsed: 500,
      })
    );
    const rpc = createTronRpcClient("https://node.example");
    const res = await rpc.getAccountResources("TWallet");
    expect(res).toEqual({ freeBandwidth: 0n, stakedBandwidth: 0n });
  });

  it("defaults everything to 0 when the response is empty", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const rpc = createTronRpcClient("https://node.example");
    const res = await rpc.getAccountResources("TWallet");
    expect(res).toEqual({ freeBandwidth: 0n, stakedBandwidth: 0n });
  });
});
