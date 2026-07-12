import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOrError } from "@guardian-sdk/sdk";
import type * as SdkModule from "@guardian-sdk/sdk";
import { createTronRpcClient } from "../../src/tron-chain/rpc/tron-rpc-client";

// Mock only `fetchOrError` (the shared axios helper) and keep every other real sdk export.
vi.mock("@guardian-sdk/sdk", async (importActual) => {
  const actual = await importActual<typeof SdkModule>();
  return { ...actual, fetchOrError: vi.fn() };
});

const mockedFetch = vi.mocked(fetchOrError);

// The raw JSON body the mocked FullNode returns for the next call.
let nextRaw = "{}";

// Mimic the real fetchOrError: run the raw JSON body through the config's `transformResponse`
// (our json-bigint parse) and return `data`, so int64 precision is exercised end-to-end.
mockedFetch.mockImplementation(
  async (config: { transformResponse?: ((raw: unknown) => unknown)[] }) => {
    const transform = config.transformResponse?.[0];
    return (transform ? transform(nextRaw) : JSON.parse(nextRaw)) as never;
  }
);

function resolveWithRaw(rawText: string) {
  nextRaw = rawText;
}
function resolveWith(json: unknown) {
  resolveWithRaw(JSON.stringify(json));
}

beforeEach(() => {
  nextRaw = "{}";
});

describe("createTronRpcClient.getAccount", () => {
  it("maps balance, frozenV2, unfrozenV2, votes into SUN bigints", async () => {
    resolveWith({
      balance: 5_000_000,
      frozenV2: [
        { amount: 100_000_000 },
        { type: "ENERGY", amount: 50_000_000 },
        { type: "TRON_POWER" },
      ],
      unfrozenV2: [{ unfreeze_amount: 40_000_000, unfreeze_expire_time: 1893456000000 }],
      votes: [{ vote_address: "TSRxxx", vote_count: 100 }],
    });
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
    resolveWithRaw(
      `{"balance":9007199254740993,"frozenV2":[{"amount":9007199254740995}],"unfrozenV2":[],"votes":[]}`
    );
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.balance).toBe(9007199254740993n);
    expect(acct.frozen).toEqual([{ resource: "BANDWIDTH", amount: 9007199254740995n }]);
  });

  it("maps a missing unfreeze_expire_time to the far-future Pending sentinel", async () => {
    resolveWith({
      balance: 0,
      frozenV2: [],
      unfrozenV2: [{ unfreeze_amount: 40_000_000 }],
      votes: [],
    });
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: Number.MAX_SAFE_INTEGER }]);
  });

  it("maps a non-positive unfreeze_expire_time to the far-future Pending sentinel", async () => {
    resolveWith({
      balance: 0,
      frozenV2: [],
      unfrozenV2: [{ unfreeze_amount: 40_000_000, unfreeze_expire_time: 0 }],
      votes: [],
    });
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: Number.MAX_SAFE_INTEGER }]);
  });
});

describe("createTronRpcClient.getReward", () => {
  it("returns reward in SUN, 0 when absent", async () => {
    resolveWith({});
    const rpc = createTronRpcClient("https://node.example");
    expect(await rpc.getReward("TWallet")).toBe(0n);
  });
});

describe("createTronRpcClient.getAccountResources", () => {
  it("returns the raw net limit/used fields verbatim as bigints", async () => {
    resolveWith({
      freeNetLimit: 5000,
      freeNetUsed: 1200,
      NetLimit: 2000,
      NetUsed: 500,
    });
    const rpc = createTronRpcClient("https://node.example");
    const res = await rpc.getAccountResources("TWallet");
    expect(res).toEqual({
      freeNetLimit: 5000n,
      freeNetUsed: 1200n,
      netLimit: 2000n,
      netUsed: 500n,
    });
  });

  it("defaults missing fields to 0n", async () => {
    resolveWith({ freeNetLimit: 100, freeNetUsed: 500 });
    const rpc = createTronRpcClient("https://node.example");
    const res = await rpc.getAccountResources("TWallet");
    expect(res).toEqual({
      freeNetLimit: 100n,
      freeNetUsed: 500n,
      netLimit: 0n,
      netUsed: 0n,
    });
  });
});

describe("createTronRpcClient.broadcast", () => {
  it("returns txid on success", async () => {
    resolveWith({ result: true, txid: "deadbeef" });
    const rpc = createTronRpcClient("https://node.example");
    expect(await rpc.broadcast(JSON.stringify({ txID: "deadbeef", signature: ["sig"] }))).toBe(
      "deadbeef"
    );
  });

  it("throws the node's real code and decoded hex message on rejection", async () => {
    // "434f4e5452414354...": hex-encoded reason returned by the FullNode.
    const hexReason = Buffer.from("Validate error", "utf8").toString("hex");
    resolveWith({ result: false, code: "CONTRACT_VALIDATE_ERROR", message: hexReason });
    const rpc = createTronRpcClient("https://node.example");
    await expect(rpc.broadcast(JSON.stringify({ txID: "x", signature: ["sig"] }))).rejects.toThrow(
      "Tron broadcast rejected: CONTRACT_VALIDATE_ERROR — Validate error"
    );
  });
});
