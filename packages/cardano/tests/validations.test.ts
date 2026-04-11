import { describe, it, expect } from "vitest";
import { ValidationError } from "@guardian-sdk/sdk";
import {
  parsePaymentAddress,
  parsePoolId,
  buildRewardAccount,
  parseCardanoPrivateKey,
} from "../src/cardano-chain/validations";

/**
 * All addresses are real mainnet values, verified with @cardano-sdk/core.
 *
 * PAYMENT_ADDRESS / STAKE_ADDRESS: CIP-0019 official test vectors
 *   https://github.com/cardano-foundation/CIPs/blob/master/CIP-0019/CIP-0019.md
 *   spend key hash: 9493315cd92eb5d8c4304e67b7e16ae36d61d34502694657811a2c8e
 *   stake key hash: 337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251
 *
 * POOL_ID: verified mainnet pool (bech32 checksum confirmed)
 *   cold key hash → 0f292fcaa02b8b2f9b3c8f9fd8e0bb21abedb692a6d5058df3ef2735
 */
const PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const STAKE_ADDRESS = "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw";
const POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";
const POOL_KEY_HASH = "0f292fcaa02b8b2f9b3c8f9fd8e0bb21abedb692a6d5058df3ef2735";
const STAKE_KEY_HASH = "337b62cfff6403a06a3acbc34f8c46003c69fe79a3628cefa9c47251";

describe("parsePaymentAddress", () => {
  it("accepts a valid mainnet base address (addr1q...)", () => {
    expect(parsePaymentAddress(PAYMENT_ADDRESS)).toBe(PAYMENT_ADDRESS);
  });

  it("throws for a reward/stake address (stake1...)", () => {
    expect(() => parsePaymentAddress(STAKE_ADDRESS)).toThrow(ValidationError);
    expect(() => parsePaymentAddress(STAKE_ADDRESS)).toSatisfy((fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code === "INVALID_ADDRESS";
      }
      return false;
    });
  });

  it("throws for a random non-bech32 string", () => {
    expect(() => parsePaymentAddress("not-a-cardano-address")).toThrow(ValidationError);
  });

  it("throws for an empty string", () => {
    expect(() => parsePaymentAddress("")).toThrow(ValidationError);
  });

  it("throws for a pool ID (pool1...)", () => {
    expect(() => parsePaymentAddress(POOL_ID)).toThrow(ValidationError);
  });
});

describe("parsePoolId", () => {
  it("converts a real mainnet pool bech32 ID to its 56-char hex key hash", () => {
    const hex = parsePoolId(POOL_ID);
    expect(hex).toMatch(/^[0-9a-f]{56}$/);
    expect(hex).toBe(POOL_KEY_HASH);
  });

  it("throws for a random string", () => {
    expect(() => parsePoolId("not-a-pool-id")).toThrow(ValidationError);
    expect(() => parsePoolId("not-a-pool-id")).toSatisfy((fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code === "INVALID_ADDRESS";
      }
      return false;
    });
  });

  it("throws for a payment address passed as pool ID", () => {
    expect(() => parsePoolId(PAYMENT_ADDRESS)).toThrow(ValidationError);
  });

  it("throws for a stake address passed as pool ID", () => {
    expect(() => parsePoolId(STAKE_ADDRESS)).toThrow(ValidationError);
  });
});

describe("buildRewardAccount", () => {
  it("builds the correct mainnet stake1... address from the CIP-0019 stake key hash", () => {
    // CIP-0019 stake key hash → stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw
    const result = buildRewardAccount(STAKE_KEY_HASH);
    expect(result).toBe(STAKE_ADDRESS);
  });

  it("output always starts with stake1", () => {
    const result = buildRewardAccount(STAKE_KEY_HASH);
    expect(result).toMatch(/^stake1/);
  });
});

describe("parseCardanoPrivateKey", () => {
  const VALID_HEX = "a".repeat(64);

  it("accepts a valid 64-char hex string", () => {
    expect(parseCardanoPrivateKey(VALID_HEX)).toBe(VALID_HEX);
  });

  it("strips a leading 0x prefix and returns bare hex", () => {
    expect(parseCardanoPrivateKey("0x" + VALID_HEX)).toBe(VALID_HEX);
  });

  it("throws for a string that is too short", () => {
    expect(() => parseCardanoPrivateKey("aa")).toThrow(ValidationError);
    expect(() => parseCardanoPrivateKey("aa")).toSatisfy((fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code === "INVALID_PRIVATE_KEY";
      }
      return false;
    });
  });

  it("throws for a string that is too long", () => {
    expect(() => parseCardanoPrivateKey("a".repeat(66))).toThrow(ValidationError);
  });

  it("throws for non-hex characters", () => {
    expect(() => parseCardanoPrivateKey("z".repeat(64))).toThrow(ValidationError);
  });

  it("accepts uppercase hex", () => {
    expect(parseCardanoPrivateKey("A".repeat(64))).toBe("A".repeat(64));
  });
});
