interface BalanceBase {
  amount: number;
}

interface Available extends BalanceBase {
    type: 'available';
}
interface Staked extends BalanceBase {
    type: 'staked';
}
interface Pending extends BalanceBase {
    type: 'pending';
}
interface Claimable extends BalanceBase {
    type: 'claimable';
}

export type Balance = Available | Staked | Pending | Claimable;
