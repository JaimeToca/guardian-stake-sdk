export interface Validator {
  id: string;
  status: ValidatorStatus;
  name: string;
  description: string;
  image: string | undefined;
  apy: number;
  delegators: number | undefined;
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

export function filterByStatus<S extends string, T extends { status: S }>(
  items: T[],
  status?: S | S[]
): T[] {
  if (!status) return items;
  const statuses = Array.isArray(status) ? status : [status];
  return items.filter((v) => statuses.includes(v.status));
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
