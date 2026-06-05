import { describe, it, expect, beforeAll } from "vitest";
import { Bip32PrivateKey, ready } from "@cardano-sdk/crypto";
import { deriveCardanoKeys } from "../../src/keys/derive-keys";

// Generate a root key from dummy entropy — deterministic, no mnemonic library needed
let TEST_ROOT_KEY: string;

beforeAll(async () => {
  await ready();
  TEST_ROOT_KEY = Bip32PrivateKey.fromBip39Entropy(
    Buffer.from("000102030405060708090a0b0c0d0e0f", "hex"),
    ""
  ).hex();
});

describe("deriveCardanoKeys", () => {
  it("derives payment and staking keys with the correct length", () => {
    const { paymentPrivateKey, stakingPrivateKey } = deriveCardanoKeys(TEST_ROOT_KEY);

    expect(paymentPrivateKey).toHaveLength(64);
    expect(stakingPrivateKey).toHaveLength(64);
  });

  it("returns lowercase hex strings", () => {
    const { paymentPrivateKey, stakingPrivateKey } = deriveCardanoKeys(TEST_ROOT_KEY);

    expect(paymentPrivateKey).toMatch(/^[0-9a-f]{64}$/);
    expect(stakingPrivateKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("payment and staking keys are different", () => {
    const { paymentPrivateKey, stakingPrivateKey } = deriveCardanoKeys(TEST_ROOT_KEY);

    expect(paymentPrivateKey).not.toBe(stakingPrivateKey);
  });

  it("is deterministic — same root key always produces the same derived keys", () => {
    const first = deriveCardanoKeys(TEST_ROOT_KEY);
    const second = deriveCardanoKeys(TEST_ROOT_KEY);

    expect(first.paymentPrivateKey).toBe(second.paymentPrivateKey);
    expect(first.stakingPrivateKey).toBe(second.stakingPrivateKey);
  });

  it("throws when root key is not 192 hex characters", () => {
    expect(() => deriveCardanoKeys("tooshort")).toThrow(
      "Invalid root key length: expected 192 hex characters (96 bytes), got 8."
    );
  });
});
