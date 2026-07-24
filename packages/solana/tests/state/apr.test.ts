import { describe, it, expect } from "vitest";
import { computeStakingApy } from "../../src/solana-chain/state/apr";

// Live-validated basis (epoch 1006): inflation 0.0373, staked fraction 0.678, ~182.6 epochs/yr.
const EPOCHS_PER_YEAR = 78_894_000 / 432_000; // ≈ 182.625

describe("computeStakingApy", () => {
  it("matches the live network case (~5.65% APY at 0% commission)", () => {
    const apy = computeStakingApy({
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: EPOCHS_PER_YEAR,
    });
    expect(apy).toBeCloseTo(5.65, 1); // within 0.05
  });

  it("compounded APY exceeds the simple APR", () => {
    const input = {
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: EPOCHS_PER_YEAR,
    };
    const apy = computeStakingApy(input);
    const simpleAprPercent = (0.0373 / 0.678) * 100; // ≈ 5.50
    expect(apy).toBeGreaterThan(simpleAprPercent);
  });

  it("returns 0 at 100% commission", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: 0.0373,
        stakedFraction: 0.678,
        commissionPercent: 100,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("clamps commission > 100 to 100 → 0", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: 0.0373,
        stakedFraction: 0.678,
        commissionPercent: 150,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("returns 0 for a non-positive or non-finite staked fraction", () => {
    const base = {
      inflationValidatorRate: 0.0373,
      commissionPercent: 0,
      epochsPerYear: EPOCHS_PER_YEAR,
    };
    expect(computeStakingApy({ ...base, stakedFraction: 0 })).toBe(0);
    expect(computeStakingApy({ ...base, stakedFraction: Infinity })).toBe(0);
    expect(computeStakingApy({ ...base, stakedFraction: Number.NaN })).toBe(0);
  });

  it("returns 0 for negative inflation", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: -0.01,
        stakedFraction: 0.678,
        commissionPercent: 0,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("clamps epochsPerYear < 1 to 1 (simple, non-compounded)", () => {
    const apy = computeStakingApy({
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: 0.5,
    });
    const simpleAprPercent = (0.0373 / 0.678) * 100; // epochsPerYear=1 → apy == apr
    expect(apy).toBeCloseTo(simpleAprPercent, 6);
  });
});
