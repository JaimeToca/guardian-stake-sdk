import { describe, it, expect, vi } from "vitest";
import { buildUnsignedTx as build } from "../../src/tron-chain/tx/tx-builder";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";
import { ValidationError } from "@guardian-sdk/sdk";
import type { TronWeb } from "tronweb";

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
  } as unknown as TronWeb;
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

  it("rejects Delegate with amount below 1 TRX", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "Delegate",
      chain,
      amount: 500_000n,
      isMaxAmount: false,
      resource: "BANDWIDTH",
    } as unknown as Transaction;
    await expect(build(tw, tx, OWNER)).rejects.toThrow(ValidationError);
    await expect(build(tw, tx, OWNER)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
  });

  it("maps Undelegate -> unfreezeBalanceV2(amount, resource, owner)", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "Undelegate",
      chain,
      amount: 100_000_000n,
      isMaxAmount: false,
      resource: "ENERGY",
    } as unknown as Transaction;
    await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.unfreezeBalanceV2).toHaveBeenCalledWith(
      100_000_000,
      "ENERGY",
      OWNER
    );
  });

  it.each(["Delegate", "Undelegate"])(
    "%s: throws ValidationError(INVALID_RESOURCE) when resource is missing",
    async (type) => {
      const tw = fakeTronWeb();
      const tx = {
        type,
        chain,
        amount: 100_000_000n,
        isMaxAmount: false,
      } as unknown as Transaction;
      await expect(build(tw, tx, OWNER)).rejects.toThrow(ValidationError);
      await expect(build(tw, tx, OWNER)).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    }
  );

  it.each(["Delegate", "Undelegate"])(
    "%s: throws ValidationError(INVALID_RESOURCE) when resource is invalid",
    async (type) => {
      const tw = fakeTronWeb();
      const tx = {
        type,
        chain,
        amount: 100_000_000n,
        isMaxAmount: false,
        resource: "NOT_A_RESOURCE",
      } as unknown as Transaction;
      await expect(build(tw, tx, OWNER)).rejects.toThrow(ValidationError);
      await expect(build(tw, tx, OWNER)).rejects.toMatchObject({ code: "INVALID_RESOURCE" });
    }
  );

  it.each(["Delegate", "Undelegate"])(
    "%s: throws ValidationError when isMaxAmount is true",
    async (type) => {
      const tw = fakeTronWeb();
      const tx = {
        type,
        chain,
        amount: 100_000_000n,
        isMaxAmount: true,
        resource: "BANDWIDTH",
      } as unknown as Transaction;
      await expect(build(tw, tx, OWNER)).rejects.toThrow(ValidationError);
      await expect(build(tw, tx, OWNER)).rejects.toMatchObject({ code: "INVALID_AMOUNT" });
    }
  );

  it("ClaimDelegate builds via withdrawExpireUnfreeze without validator/index", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "ClaimDelegate",
      chain,
      amount: 0n,
    } as unknown as Transaction;
    const result = await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.withdrawExpireUnfreeze).toHaveBeenCalledWith(OWNER);
    expect(result).toEqual({ txID: "w" });
  });

  it("ClaimRewards builds via withdrawBlockRewards without validator", async () => {
    const tw = fakeTronWeb();
    const tx = {
      type: "ClaimRewards",
      chain,
      amount: 0n,
    } as unknown as Transaction;
    const result = await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.withdrawBlockRewards).toHaveBeenCalledWith(OWNER);
    expect(result).toEqual({ txID: "r" });
  });
});
