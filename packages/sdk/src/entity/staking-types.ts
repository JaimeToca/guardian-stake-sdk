export interface GetValidatorsParams {
  page?: number;
  pageSize?: number;
}

export interface ValidatorsPagination {
  page: number;
  pageSize: number;
  /** Total number of validators. Undefined when the chain cannot determine it without fetching all pages. */
  total: number | undefined;
  /** Total number of pages. Undefined when total is not available. */
  totalPages: number | undefined;
  hasNextPage: boolean;
}

export interface ValidatorsPage {
  data: Validator[];
  pagination: ValidatorsPagination;
}

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
  activeValidators: number | undefined;
  totalValidators: number | undefined;
}
