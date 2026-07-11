import { describe, it, expect, vi } from "vitest";
import { createSignService } from "../../src/tron-chain/services/sign-service";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;

function factory() {
  const signed = { txID: "abc", signature: ["sig"] };
  const tronWeb = {
    defaultAddress: { base58: "TOwner" },
    transactionBuilder: { freezeBalanceV2: vi.fn().mockResolvedValue({ txID: "abc" }) },
    trx: { sign: vi.fn().mockResolvedValue(signed) },
  } as any;
  return { create: () => tronWeb, tronWeb, signed };
}

describe("sign", () => {
  it("builds via TronWeb, signs, returns serialized signed tx json", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    const tx = {
      type: "Delegate",
      chain,
      amount: 1_000_000n,
      isMaxAmount: false,
      resource: "BANDWIDTH",
    } as unknown as Transaction;
    const raw = await svc.sign({
      transaction: tx,
      fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n },
      nonce: 0,
      privateKey: "aa",
    } as any);
    expect(JSON.parse(raw)).toEqual(f.signed);
    expect(f.tronWeb.trx.sign).toHaveBeenCalled();
  });
});
