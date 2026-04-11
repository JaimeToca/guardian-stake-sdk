import { describe, it, expect } from "vitest";
import { isCardanoSigningWithPrivateKey } from "../src/cardano-chain/sign-types";
import type { BaseSignArgs } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../src/chain";

const baseArgs: BaseSignArgs = {
  transaction: {
    type: "Delegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: false,
    validator: "pool1...",
  },
  fee: { type: "CardanoFee", txSizeBytes: 300, total: 200000n },
  nonce: 0,
};

describe("isCardanoSigningWithPrivateKey", () => {
  it("returns true when both keys are present", () => {
    expect(
      isCardanoSigningWithPrivateKey({
        ...baseArgs,
        paymentPrivateKey: "aa".repeat(32),
        stakingPrivateKey: "bb".repeat(32),
      })
    ).toBe(true);
  });

  it("returns false when paymentPrivateKey is missing", () => {
    expect(
      isCardanoSigningWithPrivateKey({
        ...baseArgs,
        stakingPrivateKey: "bb".repeat(32),
      } as any)
    ).toBe(false);
  });

  it("returns false when stakingPrivateKey is missing", () => {
    expect(
      isCardanoSigningWithPrivateKey({
        ...baseArgs,
        paymentPrivateKey: "aa".repeat(32),
      } as any)
    ).toBe(false);
  });

  it("returns false when keys are not strings", () => {
    expect(
      isCardanoSigningWithPrivateKey({
        ...baseArgs,
        paymentPrivateKey: 123,
        stakingPrivateKey: 456,
      } as any)
    ).toBe(false);
  });

  it("returns false for base args with no extra fields", () => {
    expect(isCardanoSigningWithPrivateKey(baseArgs)).toBe(false);
  });
});
