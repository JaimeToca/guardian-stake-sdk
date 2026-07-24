/** Inputs for the issuance-APY estimate. All fractions are annual. */
export interface StakingApyInput {
  /** Validator inflation rate (annual fraction), e.g. 0.0373. */
  inflationValidatorRate: number;
  /** Fraction of total supply staked, 0 < f ≤ 1. */
  stakedFraction: number;
  /** Validator commission percent, 0..100. */
  commissionPercent: number;
  /** Compounding periods per year (~182); clamped to ≥ 1. */
  epochsPerYear: number;
}

/**
 * Issuance staking APY as a percent, per-epoch compounded and commission-adjusted.
 *
 * `networkApr = inflation / stakedFraction`;
 * `apr = networkApr × (1 − commission)`;
 * `apy = ((1 + apr / epochsPerYear) ^ epochsPerYear − 1) × 100`.
 *
 * Excludes MEV and priority/block fees. Always finite and ≥ 0 — invalid inputs return 0.
 */
export function computeStakingApy(input: StakingApyInput): number {
  const { inflationValidatorRate, stakedFraction } = input;

  if (!Number.isFinite(stakedFraction) || stakedFraction <= 0) return 0;
  if (!Number.isFinite(inflationValidatorRate) || inflationValidatorRate < 0) return 0;

  const commissionPercent = Math.min(100, Math.max(0, input.commissionPercent));
  const epochsPerYear = Number.isFinite(input.epochsPerYear) ? Math.max(1, input.epochsPerYear) : 1;

  const networkApr = inflationValidatorRate / stakedFraction;
  const apr = networkApr * (1 - commissionPercent / 100);
  const apy = (Math.pow(1 + apr / epochsPerYear, epochsPerYear) - 1) * 100;

  if (!Number.isFinite(apy) || apy < 0) return 0;
  return apy;
}
