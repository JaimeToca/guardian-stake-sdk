const BLOCKS_PER_DAY = 28_800;
const DAYS_PER_YEAR = 365;
const SR_COUNT = 27;

export interface AprInput {
  validatorVotes: bigint;
  totalVotes: bigint;
  isSr: boolean;
  witness127PayPerBlock: number; // vote reward per block (SUN)
  witnessPayPerBlock: number; // SR block production reward per block (SUN)
  brokeragePercent: number; // percent the SR keeps (0..100)
}

/**
 * Voter APR for a witness, per apr_tron.txt.
 * NOTE: the SR block-reward term follows the reference doc; validate against real on-chain
 * numbers during integration and adjust if the doc's dimensional factor is off. See spec §8 [VERIFY].
 */
export function computeApr(input: AprInput): number {
  const validatorVotes = Number(input.validatorVotes);
  const totalVotes = Number(input.totalVotes);
  if (validatorVotes <= 0 || totalVotes <= 0) return 0;

  const annualVoteRewardsPool = input.witness127PayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR;
  const annualVotingRewards = (validatorVotes * annualVoteRewardsPool) / totalVotes;
  const srBlockRewards = input.isSr ? input.witnessPayPerBlock * DAYS_PER_YEAR * SR_COUNT : 0;
  const totalAnnualRewards = annualVotingRewards + srBlockRewards;

  const clampedBrokeragePercent = Math.min(100, Math.max(0, input.brokeragePercent));
  const brokerageShare = 1 - clampedBrokeragePercent / 100;
  const apr = ((totalAnnualRewards * brokerageShare) / validatorVotes) * 100;
  if (!Number.isFinite(apr) || apr < 0) return 0;
  return apr;
}
