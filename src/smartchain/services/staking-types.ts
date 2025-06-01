import { Address } from "viem";

export interface Validator {
  id: string;
  status: ValidatorStatus;
  name: string;
  description: string;
  image: string;
  apy: number;
  delegators: number;
  operatorAddress: Address;
  creditAddress: Address;
}

export enum ValidatorStatus {
  Active,
  Inactive,
  Jailed,
}

export interface Delegations {
  delegations: Delegation[];
  stakingSummary: StakingSummary;
}

export interface Delegation {
  id: string;
  validator: Validator;
  amount: bigint;
  status: DelegationStatus;
  delegationIndex: number; // used for multiple undelegate/claims
  pendingUntil: number;
}

export enum DelegationStatus {
  Active,
  Pending,
  Claimable,
  Inactive,
}

export interface StakingSummary {
  totalProtocolStake: number;
  maxApy: number;
  minAmountToStake: bigint;
  unboundPeriodInMillis: number;
  redelegateFeeRate: number;
  activeValidators: number;
  totalValidators: number;
}
