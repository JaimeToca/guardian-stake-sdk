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

describe("deriveStakeAddressWithSeed", () => {
  // Known vectors generated via Kit address codecs (getAddressEncoder/Decoder).
  const BASE_WSOL = "So11111111111111111111111111111111111111112";
  const BASE_SYSTEM = "11111111111111111111111111111111";

  it('matches known vector for WSOL base + seed "0" + stake program', () => {
    const expected = "3xqN5C8yRt8dBZ9mHxzzfym5nvKtfgQQffFcpuAYBkvB";
    expect(deriveStakeAddressWithSeed(BASE_WSOL, "0", STAKE_PROGRAM_ADDRESS)).toBe(expected);
    expect(deriveStakeAddress(BASE_WSOL, "0")).toBe(expected);
  });

  it('matches known vector for system program base + seed "0" + stake program', () => {
    const expected = "DzkhrvkDpt4qcDZAr72wDewSHPfsGLVwcXwhJLbgwXf6";
    expect(deriveStakeAddressWithSeed(BASE_SYSTEM, "0", STAKE_PROGRAM_ADDRESS)).toBe(expected);
  });

  /**
   * Independent re-hash using only Kit address codecs for base58 encode/decode —
   * no hand-rolled base58 alphabet.
   */
  it("matches Kit address codec re-hash for varied seeds", () => {
    const enc = getAddressEncoder();
    const dec = getAddressDecoder();
    const baseBytes = enc.encode(address(BASE_WSOL));
    const ownerBytes = enc.encode(address(STAKE_PROGRAM_ADDRESS));

    for (const seed of ["0", "1", "42", "stake-seed"]) {
      const digest = createHash("sha256")
        .update(Buffer.from(baseBytes))
        .update(Buffer.from(seed, "utf8"))
        .update(Buffer.from(ownerBytes))
        .digest();
      const expected = dec.decode(digest.subarray(0, 32));
      expect(deriveStakeAddressWithSeed(BASE_WSOL, seed, STAKE_PROGRAM_ADDRESS)).toBe(expected);
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
