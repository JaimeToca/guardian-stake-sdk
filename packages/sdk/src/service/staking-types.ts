export interface Validator {
  id: string;
  status: ValidatorStatus;
  name: string;
  description: string;
  image: string | undefined;
  apy: number;
  delegators: number;
  operatorAddress: string;
  creditAddress: string;
}

export const ValidatorStatus = {
  Active: "Active",
  Inactive: "Inactive",
  Jailed: "Jailed",
} as const;
export type ValidatorStatus = typeof ValidatorStatus[keyof typeof ValidatorStatus];

export interface Delegations {
  delegations: Delegation[];
  stakingSummary: StakingSummary;
}

export interface Delegation {
  id: string;
  validator: Validator;
  amount: bigint;
  status: DelegationStatus;
  delegationIndex: bigint;
  pendingUntil: number;
}

export const DelegationStatus = {
  Active: "Active",
  Pending: "Pending",
  Claimable: "Claimable",
  Inactive: "Inactive",
} as const;
export type DelegationStatus = typeof DelegationStatus[keyof typeof DelegationStatus];

export interface StakingSummary {
  totalProtocolStake: number;
  maxApy: number;
  minAmountToStake: bigint;
  unboundPeriodInMillis: number;
  redelegateFeeRate: number;
  activeValidators: number;
  totalValidators: number;
}
