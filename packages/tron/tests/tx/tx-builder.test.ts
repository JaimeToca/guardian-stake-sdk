import { describe, it, expect, vi } from "vitest";
import { buildUnsignedTx as build } from "../../src/tron-chain/tx/tx-builder";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;
const OWNER = "TOwnerAddress";

function fakeTronWeb() {
  return {
    transactionBuilder: {
      freezeBalanceV2: vi.fn().mockResolvedValue({ txID: "f" }),
      unfreezeBalanceV2: vi.fn().mockResolvedValue({ txID: "u" }),
      vote: vi.fn().mockResolvedValue({ txID: "v" }),
      withdrawExpireUnfreeze: vi.fn().mockResolvedValue({ txID: "w" }),
      withdrawBlockRewards: vi.fn().mockResolvedValue({ txID: "r" }),
    },
  } as any;
}

describe("buildUnsignedTx", () => {
  it("maps Delegate -> freezeBalanceV2(amount, resource, owner)", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "Delegate",
      chain,
      amount: 100_000_000n,
      isMaxAmount: false,
      resource: "BANDWIDTH",
    } as unknown as Transaction;
    await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.freezeBalanceV2).toHaveBeenCalledWith(
      100_000_000,
      "BANDWIDTH",
      OWNER
    );
  });

  it("maps Vote -> vote({[sr]: votes}, owner), votes = amount / 1e6", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "Vote",
      chain,
      amount: 100_000_000n,
      validator: "TSR",
    } as unknown as Transaction;
    await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.vote).toHaveBeenCalledWith({ TSR: 100 }, OWNER);
  });

  it("rejects a non-whole-TRX vote amount", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "Vote",
      chain,
      amount: 100_500_000n,
      validator: "TSR",
    } as unknown as Transaction;
    await expect(build(tw, tx, OWNER)).rejects.toThrow();
  });
});
