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

export type ValidatorStatus = "Active" | "Inactive" | "Jailed";

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

export type DelegationStatus = "Active" | "Pending" | "Claimable" | "Inactive";

export interface StakingSummary {
  totalProtocolStake: number;
  maxApy: number;
  minAmountToStake: bigint;
  unboundPeriodInMillis: number;
  redelegateFeeRate: number;
  activeValidators: number;
  totalValidators: number;
}
