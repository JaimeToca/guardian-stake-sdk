import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { address, getAddressDecoder, getAddressEncoder } from "@solana/kit";
import {
  deriveStakeAddress,
  deriveStakeAddressWithSeed,
  seedString,
  scanSeedIndices,
  MAX_SEED_LENGTH,
} from "../../src/solana-chain/state/seed";
import {
  DEFAULT_SEED_SCAN_MAX,
  STAKE_PROGRAM_ADDRESS,
} from "../../src/solana-chain/state/constants";

/** Independent createWithSeed hash (cross-check, no Kit encoder). */
function independentCreateWithSeed(base58Base: string, seed: string, base58Owner: string): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const decode58 = (str: string): Buffer => {
    const bytes = [0];
    for (const c of str) {
      let carry = ALPHABET.indexOf(c);
      if (carry < 0) throw new Error(`bad base58 char: ${c}`);
      for (let i = 0; i < bytes.length; i++) {
        carry += bytes[i]! * 58;
        bytes[i] = carry & 0xff;
        carry >>= 8;
      }
      while (carry > 0) {
        bytes.push(carry & 0xff);
        carry >>= 8;
      }
    }
    for (const c of str) {
      if (c === "1") bytes.push(0);
      else break;
    }
    return Buffer.from(bytes.reverse());
  };
  const encode58 = (buf: Buffer): string => {
    const digits = [0];
    for (const b of buf) {
      let carry = b;
      for (let i = 0; i < digits.length; i++) {
        carry += digits[i]! << 8;
        digits[i] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    let out = "";
    for (const b of buf) {
      if (b === 0) out += "1";
      else break;
    }
    for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
    return out;
  };

  const base = decode58(base58Base);
  const owner = decode58(base58Owner);
  const digest = createHash("sha256")
    .update(base)
    .update(Buffer.from(seed, "utf8"))
    .update(owner)
    .digest();
  return encode58(digest.subarray(0, 32));
}

describe("deriveStakeAddressWithSeed", () => {
  // Known vectors generated once via Kit createWithSeed and cross-checked independently.
  const BASE_WSOL = "So11111111111111111111111111111111111111112";
  const BASE_SYSTEM = "11111111111111111111111111111111";

  it('matches known vector for WSOL base + seed "0" + stake program', () => {
    // Committed expected address (Kit + independent hash agreed).
    const expected = "3xqN5C8yRt8dBZ9mHxzzfym5nvKtfgQQffFcpuAYBkvB";
    expect(deriveStakeAddressWithSeed(BASE_WSOL, "0", STAKE_PROGRAM_ADDRESS)).toBe(expected);
    expect(deriveStakeAddress(BASE_WSOL, "0")).toBe(expected);
  });

  it('matches known vector for system program base + seed "0" + stake program', () => {
    const expected = "DzkhrvkDpt4qcDZAr72wDewSHPfsGLVwcXwhJLbgwXf6";
    expect(deriveStakeAddressWithSeed(BASE_SYSTEM, "0", STAKE_PROGRAM_ADDRESS)).toBe(expected);
  });

  it("cross-checks against an independent sha256+base58 implementation", () => {
    for (const seed of ["0", "1", "42", "stake-seed"]) {
      const ours = deriveStakeAddressWithSeed(BASE_WSOL, seed, STAKE_PROGRAM_ADDRESS);
      const theirs = independentCreateWithSeed(BASE_WSOL, seed, STAKE_PROGRAM_ADDRESS);
      expect(ours).toBe(theirs);
    }
  });

  it("matches Kit encoder re-hash for seed indices 0..5", () => {
    const enc = getAddressEncoder();
    const dec = getAddressDecoder();
    const baseBytes = enc.encode(address(BASE_WSOL));
    const ownerBytes = enc.encode(address(STAKE_PROGRAM_ADDRESS));

    for (let i = 0; i <= 5; i++) {
      const seed = seedString(i);
      const digest = createHash("sha256")
        .update(Buffer.from(baseBytes))
        .update(Buffer.from(seed, "utf8"))
        .update(Buffer.from(ownerBytes))
        .digest();
      const expected = dec.decode(digest.subarray(0, 32));
      expect(deriveStakeAddress(BASE_WSOL, seed)).toBe(expected);
    }
  });

  it("rejects seeds longer than 32 bytes", () => {
    const long = "a".repeat(MAX_SEED_LENGTH + 1);
    expect(() => deriveStakeAddressWithSeed(BASE_WSOL, long, STAKE_PROGRAM_ADDRESS)).toThrow(
      /at most 32 bytes/
    );
  });

  it("accepts a 32-byte seed", () => {
    const ok = "a".repeat(MAX_SEED_LENGTH);
    expect(() => deriveStakeAddressWithSeed(BASE_WSOL, ok, STAKE_PROGRAM_ADDRESS)).not.toThrow();
  });
});

describe("seedString / scanSeedIndices", () => {
  it("seedString formats decimal indices", () => {
    expect(seedString(0)).toBe("0");
    expect(seedString(12)).toBe("12");
  });

  it("scanSeedIndices returns 0..max inclusive", () => {
    expect(scanSeedIndices(3)).toEqual([0, 1, 2, 3]);
    expect(scanSeedIndices()).toHaveLength(DEFAULT_SEED_SCAN_MAX + 1);
    expect(scanSeedIndices()[0]).toBe(0);
    expect(scanSeedIndices().at(-1)).toBe(DEFAULT_SEED_SCAN_MAX);
  });
});
