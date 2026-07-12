interface BalanceBase {
  amount: bigint;
  type: BalanceType;
}

export type BalanceType = "Available" | "Staked" | "Pending" | "Claimable" | "Rewards";

/**
 * Liquid balance sitting in the wallet, free to spend, delegate, or transfer.
 *
 * Supported by: BSC, Cardano, Tron
 */
interface AvailableBalance extends BalanceBase {
  type: "Available";
}

/**
 * Amount currently delegated to a validator.
 * On lock-based chains (e.g. BSC, Tron) this is frozen and cannot be spent until undelegated.
 * On delegation-only chains (e.g. Cardano) nothing is locked, so this equals Available.
 *
 * Supported by: BSC (contains rewards already), Cardano, Tron (frozen principal; excludes rewards)
 */
interface StakedBalance extends BalanceBase {
  type: "Staked";
}

/**
 * Amount in the unbonding period after undelegation.
 * No longer earning rewards, not yet spendable — the chain is enforcing a waiting period
 * before returning it to Available. Not applicable on chains with no unbonding period.
 *
 * Supported by: BSC, Tron
 */
interface PendingBalance extends BalanceBase {
  type: "Pending";
}

/**
 * Funds that have completed the unbonding period and can be reclaimed.
 * On chains that require an explicit claim transaction (e.g. BSC, Tron), the amount
 * sits in a contract until the user submits a claim tx to return it to their wallet.
 *
 * Supported by: BSC, Tron
 */
interface ClaimableBalance extends BalanceBase {
  type: "Claimable";
}

/**
 * Rewards earned, for display and history purposes only.
 *
 * Supported by: Cardano, Tron
 */
interface RewardsBalance extends BalanceBase {
  type: "Rewards";
}

export type Balance =
  | AvailableBalance
  | StakedBalance
  | PendingBalance
  | ClaimableBalance
  | RewardsBalance;
