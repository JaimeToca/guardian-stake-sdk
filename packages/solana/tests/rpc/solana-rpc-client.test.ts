import { describe, it, expect, vi } from "vitest";
import { ApiError } from "@guardian-sdk/sdk";
import type * as SolanaKit from "@solana/kit";

// Mock @solana/kit's createSolanaRpc so we can control exactly what getMultipleAccounts()
// resolves to, without a live RPC endpoint. Only the methods this test exercises are stubbed;
// other calls in this file's suite would need extending the mock.
const sendMock = vi.fn();
const getMultipleAccountsMock = vi.fn(() => ({ send: sendMock }));

vi.mock("@solana/kit", async (importOriginal) => {
  const actual = await importOriginal<typeof SolanaKit>();
  return {
    ...actual,
    createSolanaRpc: () => ({
      getMultipleAccounts: getMultipleAccountsMock,
    }),
  };
});

// Imported after the mock is registered so the factory picks up the mocked createSolanaRpc.
const { createSolanaRpcClient } = await import("../../src/solana-chain/rpc/solana-rpc-client");

const ADDR_A = "So11111111111111111111111111111111111111112";
const ADDR_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const OWNER = "Stake11111111111111111111111111111111111111";

function fakeAccount(lamports: bigint) {
  return {
    lamports,
    data: [Buffer.from([1, 2, 3]).toString("base64"), "base64"] as const,
    owner: OWNER,
  };
}

describe("M-SOLANA-3: getMultipleAccounts length check", () => {
  it("throws ApiError when the RPC returns fewer accounts than requested (shifted/short array)", async () => {
    sendMock.mockResolvedValueOnce({
      // Requested 2 addresses, RPC returns only 1 — a naive positional zip would mis-associate
      // ADDR_B's slot with `undefined`/wrong data instead of failing loudly.
      value: [fakeAccount(1_000_000n)],
    });

    const client = createSolanaRpcClient("https://example-rpc.invalid");
    await expect(client.getMultipleAccounts([ADDR_A, ADDR_B])).rejects.toBeInstanceOf(ApiError);
  });

  it("throws ApiError when the RPC returns more accounts than requested", async () => {
    sendMock.mockResolvedValueOnce({
      value: [fakeAccount(1_000_000n), fakeAccount(2_000_000n), fakeAccount(3_000_000n)],
    });

    const client = createSolanaRpcClient("https://example-rpc.invalid");
    await expect(client.getMultipleAccounts([ADDR_A, ADDR_B])).rejects.toBeInstanceOf(ApiError);
  });

  it("succeeds when lengths match, preserving positional correspondence", async () => {
    sendMock.mockResolvedValueOnce({
      value: [fakeAccount(1_000_000n), null],
    });

    const client = createSolanaRpcClient("https://example-rpc.invalid");
    const result = await client.getMultipleAccounts([ADDR_A, ADDR_B]);

    expect(result).toHaveLength(2);
    expect(result[0]?.address).toBe(ADDR_A);
    expect(result[0]?.lamports).toBe(1_000_000n);
    expect(result[1]).toBeNull();
  });
});
