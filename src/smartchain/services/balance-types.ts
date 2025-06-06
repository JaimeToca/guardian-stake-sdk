/**
 * Defines the common structure for different types of balances.
 */
interface BalanceBase {
  /**
   * The amount of the balance, represented as a `bigint`.
   */
  amount: bigint;
  /**
   * The specific type of balance, categorized by the `BalanceType` enum.
   */
  type: BalanceType;
}

/**
 * Enumerates the different categories or states a balance can be in.
 */
export enum BalanceType {
  /**
   * Represents funds that are immediately accessible and usable.
   */
  Available,
  /**
   * Represents funds that are currently locked or committed, for example, in a staking contract.
   */
  Staked,
  /**
   * Represents funds that are in a transitional state, such as awaiting an unbonding period to complete.
   */
  Pending,
  /**
   * Represents funds that have completed a pending period (e.g., unbonding) and are now ready to be withdrawn or claimed.
   */
  Claimable,
}

/**
 * Represents an available balance, directly extending `BalanceBase` and specifically typing it as `Available`.
 */
interface AvailableBalance extends BalanceBase {
  type: BalanceType.Available;
}

/**
 * Represents a staked balance, directly extending `BalanceBase` and specifically typing it as `Staked`.
 */
interface StakedBalance extends BalanceBase {
  type: BalanceType.Staked;
}

/**
 * Represents a pending balance, directly extending `BalanceBase` and specifically typing it as `Pending`.
 */
interface PendingBalance extends BalanceBase {
  type: BalanceType.Pending;
}

/**
 * Represents a claimable balance, directly extending `BalanceBase` and specifically typing it as `Claimable`.
 */
interface ClaimableBalance extends BalanceBase {
  type: BalanceType.Claimable;
}

/**
 * A union type that encompasses all possible balance types.
 * This allows for flexible handling of different balance states while maintaining type safety.
 */
export type Balance =
  | AvailableBalance
  | StakedBalance
  | PendingBalance
  | ClaimableBalance;
