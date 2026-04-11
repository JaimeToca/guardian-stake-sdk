import { describe, it, expect } from "vitest";
import {
  isCardanoSigningWithPrivateKey,
  type CardanoSigningWithPrivateKey,
} from "../src/cardano-chain/sign-types";
import type { BaseSignArgs } from "@guardian-sdk/sdk";

const mockTransaction = {
  type: "Delegate" as const,
  chain: { id: "cardano-mainnet" } as any,
  amount: 0n,
  account: "addr1qtest",
  isMaxAmount: false,
  validator: {} as any,
};

const baseFee = { type: "CardanoFee" as const, txSizeBytes: 300, total: 180_000n };

describe("isCardanoSigningWithPrivateKey", () => {
  it("returns true when both paymentPrivateKey and stakingPrivateKey are strings", () => {
    const args: CardanoSigningWithPrivateKey = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      paymentPrivateKey: "a".repeat(64),
      stakingPrivateKey: "b".repeat(64),
    };
    expect(isCardanoSigningWithPrivateKey(args)).toBe(true);
  });

  it("returns false when paymentPrivateKey is missing", () => {
    const args: BaseSignArgs = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
    };
    expect(isCardanoSigningWithPrivateKey(args)).toBe(false);
  });

  it("returns false when stakingPrivateKey is missing", () => {
    const args = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      paymentPrivateKey: "a".repeat(64),
    } as BaseSignArgs;
    expect(isCardanoSigningWithPrivateKey(args)).toBe(false);
  });

  it("returns false when paymentPrivateKey is not a string", () => {
    const args = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      paymentPrivateKey: 12345,
      stakingPrivateKey: "b".repeat(64),
    } as unknown as BaseSignArgs;
    expect(isCardanoSigningWithPrivateKey(args)).toBe(false);
  });

  it("returns false when stakingPrivateKey is not a string", () => {
    const args = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      paymentPrivateKey: "a".repeat(64),
      stakingPrivateKey: null,
    } as unknown as BaseSignArgs;
    expect(isCardanoSigningWithPrivateKey(args)).toBe(false);
  });

  it("returns false for an EVM-style signing args object with only privateKey", () => {
    const args = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      privateKey: "0x" + "a".repeat(64),
    } as BaseSignArgs;
    expect(isCardanoSigningWithPrivateKey(args)).toBe(false);
  });

  it("returns true for empty-string keys (format validation is separate)", () => {
    const args = {
      transaction: mockTransaction,
      fee: baseFee,
      nonce: 0,
      paymentPrivateKey: "",
      stakingPrivateKey: "",
    } as CardanoSigningWithPrivateKey;
    // The type guard only checks presence and string type, not content
    expect(isCardanoSigningWithPrivateKey(args)).toBe(true);
  });
});