import { describe, it, expect, vi } from "vitest";
import { createSignService } from "../../src/tron-chain/services/sign-service";
import { SigningError } from "@guardian-sdk/sdk";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;

function factory(defaultAddressBase58: string | undefined = "TOwner") {
  const signed = { txID: "abc", signature: ["sig"] };
  const tronWeb = {
    defaultAddress: { base58: defaultAddressBase58 },
    transactionBuilder: { freezeBalanceV2: vi.fn().mockResolvedValue({ txID: "abc" }) },
    trx: { sign: vi.fn().mockResolvedValue(signed) },
  } as any;
  return { create: () => tronWeb, tronWeb, signed };
}

const delegateTx = {
  type: "Delegate",
  chain,
  amount: 1_000_000n,
  isMaxAmount: false,
  resource: "BANDWIDTH",
} as unknown as Transaction;

describe("sign", () => {
  it("builds via TronWeb, signs, returns serialized signed tx json", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    const raw = await svc.sign({
      transaction: delegateTx,
      fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
      nonce: 0,
      privateKey: "aa",
    } as any);
    expect(JSON.parse(raw)).toEqual(f.signed);
    expect(f.tronWeb.trx.sign).toHaveBeenCalled();
  });

  it("throws SigningError when privateKey is missing", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    await expect(
      svc.sign({
        transaction: delegateTx,
        fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
        nonce: 0,
        privateKey: "",
      } as any)
    ).rejects.toThrow(SigningError);
  });

  it("throws SigningError when defaultAddress.base58 is falsy", async () => {
    const f = factory("");
    const svc = createSignService(f as any);
    await expect(
      svc.sign({
        transaction: delegateTx,
        fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
        nonce: 0,
        privateKey: "aa",
      } as any)
    ).rejects.toThrow(SigningError);
  });

  it("builds with the owner from defaultAddress.base58, not transaction.account", async () => {
    const f = factory("TRealOwner");
    const svc = createSignService(f as any);
    const txWithDifferentAccount = {
      ...delegateTx,
      account: "TSomeOtherAccount",
    } as unknown as Transaction;

    await svc.sign({
      transaction: txWithDifferentAccount,
      fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
      nonce: 0,
      privateKey: "aa",
    } as any);

    expect(f.tronWeb.transactionBuilder.freezeBalanceV2).toHaveBeenCalledWith(
      1_000_000,
      "BANDWIDTH",
      "TRealOwner"
    );
  });
});

describe("prehash", () => {
  it("throws when transaction.account is missing", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    await expect(
      svc.prehash({
        transaction: delegateTx,
        fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
        nonce: 0,
      } as any)
    ).rejects.toThrow(SigningError);
  });

  it("returns serializedTransaction === unsigned.txID and sets signArgs._rawTx on success", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    const txWithAccount = { ...delegateTx, account: "TOwner" } as unknown as Transaction;

    const result = await svc.prehash({
      transaction: txWithAccount,
      fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
      nonce: 0,
    } as any);

    expect(result.serializedTransaction).toBe("abc");
    expect((result.signArgs as any)._rawTx).toEqual({ txID: "abc" });
  });
});

describe("compile", () => {
  it("throws when _rawTx is missing", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    await expect(
      svc.compile({
        signArgs: {
          transaction: delegateTx,
          fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
          nonce: 0,
        } as any,
        signature: "sig",
      })
    ).rejects.toThrow(SigningError);
  });

  it("throws on empty signature", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    await expect(
      svc.compile({
        signArgs: {
          transaction: delegateTx,
          fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
          nonce: 0,
          _rawTx: { txID: "abc" },
        } as any,
        signature: "",
      })
    ).rejects.toThrow(SigningError);
  });

  it("round-trips prehash's signArgs: preserves _rawTx and sets signature: [signature]", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    const txWithAccount = { ...delegateTx, account: "TOwner" } as unknown as Transaction;

    const prehashResult = await svc.prehash({
      transaction: txWithAccount,
      fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
      nonce: 0,
    } as any);

    const raw = await svc.compile({
      signArgs: prehashResult.signArgs,
      signature: "the-signature",
    });

    const parsed = JSON.parse(raw);
    expect(parsed.signature).toEqual(["the-signature"]);
    expect(parsed.txID).toBe("abc");
  });
});
