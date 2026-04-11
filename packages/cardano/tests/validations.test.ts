import { describe, it, expect } from "vitest";
import {
  parsePaymentAddress,
  parsePoolId,
  buildRewardAccount,
  parseCardanoPrivateKey,
} from "../src/cardano-chain/validations";
import { ValidationError } from "@guardian-sdk/sdk";

// Real Cardano mainnet addresses for testing
const VALID_PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae";
const VALID_STAKE_ADDRESS = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";
const VALID_POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

describe("parsePaymentAddress", () => {
  it("accepts a valid mainnet payment address (addr1...)", () => {
    expect(() => parsePaymentAddress(VALID_PAYMENT_ADDRESS)).not.toThrow();
  });

  it("returns the address unchanged on success", () => {
    const result = parsePaymentAddress(VALID_PAYMENT_ADDRESS);
    expect(result).toBe(VALID_PAYMENT_ADDRESS);
  });

  it("throws INVALID_ADDRESS for a stake address (stake1...)", () => {
    expect(() => parsePaymentAddress(VALID_STAKE_ADDRESS)).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for an empty string", () => {
    expect(() => parsePaymentAddress("")).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for an arbitrary non-address string", () => {
    expect(() => parsePaymentAddress("not-an-address")).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for a pool ID passed as payment address", () => {
    expect(() => parsePaymentAddress(VALID_POOL_ID)).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });
});

describe("parsePoolId", () => {
  it("accepts a valid pool ID (pool1...)", () => {
    expect(() => parsePoolId(VALID_POOL_ID)).not.toThrow();
  });

  it("returns a 56-character hex string (28-byte key hash)", () => {
    const result = parsePoolId(VALID_POOL_ID);
    expect(result).toMatch(/^[0-9a-f]{56}$/);
  });

  it("throws INVALID_ADDRESS for a payment address", () => {
    expect(() => parsePoolId(VALID_PAYMENT_ADDRESS)).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for a stake address", () => {
    expect(() => parsePoolId(VALID_STAKE_ADDRESS)).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for an empty string", () => {
    expect(() => parsePoolId("")).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws INVALID_ADDRESS for a random string", () => {
    expect(() => parsePoolId("notapool")).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("returns a consistent result for the same pool ID", () => {
    const result1 = parsePoolId(VALID_POOL_ID);
    const result2 = parsePoolId(VALID_POOL_ID);
    expect(result1).toBe(result2);
  });
});

describe("buildRewardAccount", () => {
  const STAKE_KEY_HASH_HEX = "0".repeat(56); // 28 zero bytes

  it("returns a string starting with stake1", () => {
    const result = buildRewardAccount(STAKE_KEY_HASH_HEX);
    expect(result).toMatch(/^stake1/);
  });

  it("returns a non-empty bech32 string", () => {
    const result = buildRewardAccount(STAKE_KEY_HASH_HEX);
    expect(result.length).toBeGreaterThan(0);
  });

  it("is deterministic — same hash produces same address", () => {
    const result1 = buildRewardAccount(STAKE_KEY_HASH_HEX);
    const result2 = buildRewardAccount(STAKE_KEY_HASH_HEX);
    expect(result1).toBe(result2);
  });

  it("produces different addresses for different key hashes", () => {
    const hash1 = "0".repeat(56);
    const hash2 = "1".repeat(56);
    const result1 = buildRewardAccount(hash1);
    const result2 = buildRewardAccount(hash2);
    expect(result1).not.toBe(result2);
  });
});

describe("parseCardanoPrivateKey", () => {
  const VALID_KEY = "a".repeat(64); // 32 bytes as 64 hex chars

  it("accepts a valid 64-char hex string", () => {
    expect(() => parseCardanoPrivateKey(VALID_KEY)).not.toThrow();
  });

  it("returns the stripped key (no 0x prefix)", () => {
    const result = parseCardanoPrivateKey(VALID_KEY);
    expect(result).toBe(VALID_KEY);
  });

  it("accepts a 64-char hex string with 0x prefix and strips it", () => {
    const result = parseCardanoPrivateKey("0x" + VALID_KEY);
    expect(result).toBe(VALID_KEY);
  });

  it("accepts uppercase hex characters", () => {
    expect(() => parseCardanoPrivateKey("A".repeat(64))).not.toThrow();
  });

  it("accepts mixed-case hex characters", () => {
    expect(() => parseCardanoPrivateKey("aAbBcCdDeEfF" + "0".repeat(52))).not.toThrow();
  });

  it("throws INVALID_PRIVATE_KEY for a 63-char hex string (too short)", () => {
    expect(() => parseCardanoPrivateKey("a".repeat(63))).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
      return true;
    });
  });

  it("throws INVALID_PRIVATE_KEY for a 65-char hex string (too long)", () => {
    expect(() => parseCardanoPrivateKey("a".repeat(65))).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
      return true;
    });
  });

  it("throws INVALID_PRIVATE_KEY for a 128-char hex string (BIP32 extended key, too long)", () => {
    expect(() => parseCardanoPrivateKey("a".repeat(128))).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
      return true;
    });
  });

  it("throws INVALID_PRIVATE_KEY for non-hex characters", () => {
    expect(() => parseCardanoPrivateKey("g".repeat(64))).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
      return true;
    });
  });

  it("throws INVALID_PRIVATE_KEY for an empty string", () => {
    expect(() => parseCardanoPrivateKey("")).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
      return true;
    });
  });

  it("throws INVALID_PRIVATE_KEY for a key with spaces", () => {
    expect(() => parseCardanoPrivateKey("a".repeat(32) + " " + "a".repeat(31))).toSatisfy(
      (thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_PRIVATE_KEY");
        return true;
      }
    );
  });
});