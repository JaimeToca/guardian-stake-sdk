import { describe, it, expect, vi } from "vitest";
import { getAddress } from "viem";
import { createStakingRpcClient } from "../../src/smartchain/rpc/staking-rpc-client";
import { ApiError } from "@guardian-sdk/sdk";

const CREDIT_CONTRACT = getAddress("0x4afc633e7b6beb8e552ccddbe06cca3754991e9a");
const DELEGATOR = getAddress("0x8894e0a0c962cb723c1976a4421c95949be2d4e1");

function makeClient(callResult: { data?: `0x${string}` } | undefined) {
  return {
    call: vi.fn().mockResolvedValue(callResult),
    multicall: vi.fn(),
  };
}

describe("createStakingRpcClient — empty RPC response (M-BSC-3)", () => {
  it("getCreditContractValidators throws a typed ApiError on empty (0x) data", async () => {
    const client = makeClient({ data: "0x" });
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getCreditContractValidators()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      return true;
    });
  });

  it("getCreditContractValidators throws a typed ApiError when data is undefined", async () => {
    const client = makeClient({ data: undefined });
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getCreditContractValidators()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      return true;
    });
  });

  it("getCreditContractValidators throws a typed ApiError when result object itself is undefined", async () => {
    const client = makeClient(undefined);
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getCreditContractValidators()).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ApiError);
      return true;
    });
  });

  it("getUnbondRequestData throws a typed ApiError on empty (0x) data", async () => {
    const client = makeClient({ data: "0x" });
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getUnbondRequestData(CREDIT_CONTRACT, DELEGATOR, 0n)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        return true;
      }
    );
  });

  it("getShareBalance throws a typed ApiError on empty (0x) data", async () => {
    const client = makeClient({ data: "0x" });
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getShareBalance(CREDIT_CONTRACT, DELEGATOR)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        return true;
      }
    );
  });

  it("getSharesByPooledBNBData throws a typed ApiError on empty (0x) data", async () => {
    const client = makeClient({ data: "0x" });
    const rpc = createStakingRpcClient(client as any);

    await expect(rpc.getSharesByPooledBNBData(CREDIT_CONTRACT, 1n)).rejects.toSatisfy(
      (err: unknown) => {
        expect(err).toBeInstanceOf(ApiError);
        return true;
      }
    );
  });

  it("error message does not leak raw response data", async () => {
    const client = makeClient({ data: "0x" });
    const rpc = createStakingRpcClient(client as any);

    try {
      await rpc.getShareBalance(CREDIT_CONTRACT, DELEGATOR);
      expect.fail("expected rpc.getShareBalance to throw");
    } catch (err) {
      expect((err as Error).message).not.toContain(CREDIT_CONTRACT);
      expect((err as Error).message).not.toContain(DELEGATOR);
    }
  });
});
