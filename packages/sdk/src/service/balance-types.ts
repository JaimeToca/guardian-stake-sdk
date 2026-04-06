interface BalanceBase {
  amount: bigint;
  type: BalanceType;
}

export type BalanceType = "Available" | "Staked" | "Pending" | "Claimable";

interface AvailableBalance extends BalanceBase {
  type: "Available";
}

interface StakedBalance extends BalanceBase {
  type: "Staked";
}

interface PendingBalance extends BalanceBase {
  type: "Pending";
}

interface ClaimableBalance extends BalanceBase {
  type: "Claimable";
}

export type Balance = AvailableBalance | StakedBalance | PendingBalance | ClaimableBalance;
