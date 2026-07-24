import { describe, it, expect } from "vitest";
import { address, createAddressWithSeed } from "@solana/kit";
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
  // Known vectors from Kit createAddressWithSeed (create_with_seed, not PDA).
  const BASE_WSOL = "So11111111111111111111111111111111111111112";
  const BASE_SYSTEM = "11111111111111111111111111111111";

  it('matches known vector for WSOL base + seed "0" + stake program', async () => {
    const expected = "3xqN5C8yRt8dBZ9mHxzzfym5nvKtfgQQffFcpuAYBkvB";
    await expect(deriveStakeAddressWithSeed(BASE_WSOL, "0", STAKE_PROGRAM_ADDRESS)).resolves.toBe(
      expected
    );
    await expect(deriveStakeAddress(BASE_WSOL, "0")).resolves.toBe(expected);
  });

  it('matches known vector for system program base + seed "0" + stake program', async () => {
    const expected = "DzkhrvkDpt4qcDZAr72wDewSHPfsGLVwcXwhJLbgwXf6";
    await expect(deriveStakeAddressWithSeed(BASE_SYSTEM, "0", STAKE_PROGRAM_ADDRESS)).resolves.toBe(
      expected
    );
  });

  it("delegates to Kit createAddressWithSeed for varied seeds", async () => {
    for (const seed of ["0", "1", "42", "stake-seed"]) {
      const expected = await createAddressWithSeed({
        baseAddress: address(BASE_WSOL),
        programAddress: STAKE_PROGRAM_ADDRESS,
        seed,
      });
      await expect(
        deriveStakeAddressWithSeed(BASE_WSOL, seed, STAKE_PROGRAM_ADDRESS)
      ).resolves.toBe(expected);
    }
  });

  it("matches Kit createAddressWithSeed for seed indices 0..5", async () => {
    for (let i = 0; i <= 5; i++) {
      const seed = seedString(i);
      const expected = await createAddressWithSeed({
        baseAddress: address(BASE_WSOL),
        programAddress: STAKE_PROGRAM_ADDRESS,
        seed,
      });
      await expect(deriveStakeAddress(BASE_WSOL, seed)).resolves.toBe(expected);
    }
  });

  it("rejects seeds longer than 32 bytes", async () => {
    const long = "a".repeat(MAX_SEED_LENGTH + 1);
    await expect(
      deriveStakeAddressWithSeed(BASE_WSOL, long, STAKE_PROGRAM_ADDRESS)
    ).rejects.toThrow(/maximum length of 32/);
  });

  it("accepts a 32-byte seed", async () => {
    const ok = "a".repeat(MAX_SEED_LENGTH);
    await expect(
      deriveStakeAddressWithSeed(BASE_WSOL, ok, STAKE_PROGRAM_ADDRESS)
    ).resolves.toBeTypeOf("string");
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
