interface BalanceBase {
  amount: bigint;
  type: BalanceType;
}

export const BalanceType = {
  Available: "Available",
  Staked: "Staked",
  Pending: "Pending",
  Claimable: "Claimable",
} as const;
export type BalanceType = typeof BalanceType[keyof typeof BalanceType];

interface AvailableBalance extends BalanceBase {
  type: typeof BalanceType.Available;
}

interface StakedBalance extends BalanceBase {
  type: typeof BalanceType.Staked;
}

interface PendingBalance extends BalanceBase {
  type: typeof BalanceType.Pending;
}

interface ClaimableBalance extends BalanceBase {
  type: typeof BalanceType.Claimable;
}

export type Balance = AvailableBalance | StakedBalance | PendingBalance | ClaimableBalance;
