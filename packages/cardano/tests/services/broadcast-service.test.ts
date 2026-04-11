import { describe, it, expect, vi } from "vitest";
import { BroadcastService } from "../../src/cardano-chain/services/broadcast-service";
import type { BlockfrostRpcClientContract } from "../../src/cardano-chain/rpc/blockfrost-rpc-client-contract";

function makeRpcClient(txHash = "abc123txhash"): BlockfrostRpcClientContract {
  return {
    getPools: vi.fn(),
    getPoolMetadata: vi.fn(),
    getAccount: vi.fn(),
    getUtxos: vi.fn(),
    getProtocolParams: vi.fn(),
    getNetwork: vi.fn(),
    submitTx: vi.fn().mockResolvedValue(txHash),
  };
}

describe("BroadcastService", () => {
  it("returns the tx hash from submitTx", async () => {
    const expectedHash = "deadbeef00112233445566778899aabb";
    const rpcClient = makeRpcClient(expectedHash);
    const service = new BroadcastService(rpcClient);

    const result = await service.broadcast("cbor_hex_data");

    expect(result).toBe(expectedHash);
  });

  it("calls rpcClient.submitTx with the raw CBOR hex", async () => {
    const rpcClient = makeRpcClient();
    const service = new BroadcastService(rpcClient);
    const rawTx = "84a500818258200000000000000000000000000000000000000000000000";

    await service.broadcast(rawTx);

    expect(rpcClient.submitTx).toHaveBeenCalledWith(rawTx);
    expect(rpcClient.submitTx).toHaveBeenCalledTimes(1);
  });

  it("propagates errors thrown by submitTx", async () => {
    const rpcClient = makeRpcClient();
    (rpcClient.submitTx as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Transaction submission failed")
    );
    const service = new BroadcastService(rpcClient);

    await expect(service.broadcast("some_cbor")).rejects.toThrow(
      "Transaction submission failed"
    );
  });

  it("works without an explicit logger (default NoopLogger)", async () => {
    const rpcClient = makeRpcClient("txhash123");
    // No logger passed — should use NoopLogger by default
    const service = new BroadcastService(rpcClient);

    await expect(service.broadcast("cbor")).resolves.toBe("txhash123");
  });
});