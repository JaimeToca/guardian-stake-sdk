interface BalanceBase {
  amount: bigint;
  type: BalanceType;
}

export enum BalanceType {
  Available = "Available",
  Staked = "Staked",
  Pending = "Pending",
  Claimable = "Claimable",
}

interface AvailableBalance extends BalanceBase {
  type: BalanceType.Available;
}

interface StakedBalance extends BalanceBase {
  type: BalanceType.Staked;
}

interface PendingBalance extends BalanceBase {
  type: BalanceType.Pending;
}

interface ClaimableBalance extends BalanceBase {
  type: BalanceType.Claimable;
}

export type Balance =
  | AvailableBalance
  | StakedBalance
  | PendingBalance
  | ClaimableBalance;
