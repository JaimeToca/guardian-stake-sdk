import { describe, it, expect, vi } from "vitest";
import { SigningError } from "@guardian-sdk/sdk";
import { createBroadcastService } from "../../src/solana-chain/services/broadcast-service";
import { isBlockhashExpiredMessage } from "../../src/solana-chain/rpc/solana-rpc-client";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";

const WIRE = "AQAAbase64wiretx==";

function mockRpc(sendTransaction = vi.fn().mockResolvedValue("sig123")): SolanaRpcClientContract {
  return { sendTransaction } as unknown as SolanaRpcClientContract;
}

describe("createBroadcastService", () => {
  it("forwards configured JSON-RPC options to sendTransaction", async () => {
    const send = vi.fn().mockResolvedValue("sig123");
    const svc = createBroadcastService(mockRpc(send), {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 3,
      minContextSlot: 100n,
    });

    const sig = await svc.broadcast(WIRE);
    expect(sig).toBe("sig123");
    expect(send).toHaveBeenCalledWith(WIRE, {
      skipPreflight: true,
      preflightCommitment: "confirmed",
      maxRetries: 3,
      minContextSlot: 100n,
    });
  });

  it("passes an empty options object through when none configured", async () => {
    const send = vi.fn().mockResolvedValue("sig123");
    const svc = createBroadcastService(mockRpc(send));
    await svc.broadcast(WIRE);
    expect(send).toHaveBeenCalledWith(WIRE, {});
  });

  it("rejects an empty wire transaction", async () => {
    const svc = createBroadcastService(mockRpc());
    await expect(svc.broadcast("")).rejects.toBeInstanceOf(SigningError);
  });

  it("propagates a BLOCKHASH_EXPIRED error raised by the RPC layer", async () => {
    const { BroadcastError } = await import("@guardian-sdk/sdk");
    const send = vi.fn().mockRejectedValue(new BroadcastError("BLOCKHASH_EXPIRED", "expired"));
    const svc = createBroadcastService(mockRpc(send));
    await expect(svc.broadcast(WIRE)).rejects.toMatchObject({ code: "BLOCKHASH_EXPIRED" });
  });
});

describe("isBlockhashExpiredMessage", () => {
  it("matches the common expired-blockhash phrasings (case-insensitive)", () => {
    expect(isBlockhashExpiredMessage("Transaction simulation failed: Blockhash not found")).toBe(
      true
    );
    expect(isBlockhashExpiredMessage("BlockhashNotFound")).toBe(true);
    expect(isBlockhashExpiredMessage("block height exceeded maximum allowed")).toBe(true);
  });

  it("does not match unrelated errors", () => {
    expect(isBlockhashExpiredMessage("insufficient funds for rent")).toBe(false);
    expect(isBlockhashExpiredMessage("node is behind by 42 slots")).toBe(false);
  });
});
