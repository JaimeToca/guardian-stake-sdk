import { describe, it, expect } from "vitest";
import { computeApr } from "../../src/tron-chain/apr/apr-calculator";

describe("computeApr", () => {
  it("computes voter APR for a non-SR witness", () => {
    // block_vote_reward=16, votes=1e9, total=4e10, brokerage keeps 20% -> share 0.8
    // annualVoting = 1e9 * (16*28800*365) / 4e10 = 4204800
    // APR = (4204800 * 0.8 / 1e9) * 100 = 0.336384
    const apr = computeApr({
      validatorVotes: 1_000_000_000n,
      totalVotes: 40_000_000_000n,
      isSr: false,
      witness127PayPerBlock: 16,
      witnessPayPerBlock: 16,
      brokeragePercent: 20,
    });
    expect(apr).toBeCloseTo(0.336384, 6);
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
});
