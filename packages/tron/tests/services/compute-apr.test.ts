import { describe, it, expect } from "vitest";
import { computeApr } from "../../src/tron-chain/services/staking-service";

describe("computeApr", () => {
  it("computes voter APR for a non-SR witness", () => {
    // block_vote_reward=16, votes=1e9, total=4e10, brokerage keeps 20% -> share 0.8
    // annualVoting = 1e9 * (16*28800*365) / 4e10 = 4204800
    // (4204800 * 0.8 / 1e9) * 100 = 0.336384 (in "units")
    // then / SUN_PER_TRX (1_000_000) to convert SUN-per-TRX to percentage
    const apr = computeApr({
      validatorVotes: 1_000_000_000n,
      totalVotes: 40_000_000_000n,
      isSr: false,
      witness127PayPerBlock: 16,
      witnessPayPerBlock: 16,
      brokeragePercent: 20,
    });
    expect(apr).toBeCloseTo(0.000000336384, 12);
  });

  it("returns 0 when the witness has no votes", () => {
    expect(
      computeApr({
        validatorVotes: 0n,
        totalVotes: 40_000_000_000n,
        isSr: true,
        witness127PayPerBlock: 16,
        witnessPayPerBlock: 16,
        brokeragePercent: 20,
      })
    ).toBe(0);
  });

  it("brokeragePercent > 100 clamps to 100 -> zero share -> apr is 0", () => {
    const apr = computeApr({
      validatorVotes: 1_000_000_000n,
      totalVotes: 40_000_000_000n,
      isSr: false,
      witness127PayPerBlock: 16,
      witnessPayPerBlock: 16,
      brokeragePercent: 120,
    });
    expect(apr).toBe(0);
  });

  it("brokeragePercent < 0 clamps to 0 -> full share -> matches the share-1 result, finite and >= 0", () => {
    const apr = computeApr({
      validatorVotes: 1_000_000_000n,
      totalVotes: 40_000_000_000n,
      isSr: false,
      witness127PayPerBlock: 16,
      witnessPayPerBlock: 16,
      brokeragePercent: -10,
    });
    // clamped to 0 -> brokerageShare = 1, same as computing with brokeragePercent: 0
    const expected = computeApr({
      validatorVotes: 1_000_000_000n,
      totalVotes: 40_000_000_000n,
      isSr: false,
      witness127PayPerBlock: 16,
      witnessPayPerBlock: 16,
      brokeragePercent: 0,
    });
    expect(Number.isFinite(apr)).toBe(true);
    expect(apr).toBeGreaterThanOrEqual(0);
    expect(apr).toBe(expected);
  });
});
