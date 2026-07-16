import type {
  Delegations,
  GetValidatorsParams,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";

export interface TronStakingServiceContract {
  /** Super Representatives + computed APR for the requested page (brokerage fetched per page). */
  getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage>;
  /** Resource-granular positions: one entry per frozenV2/unfrozenV2 (Active/Frozen/Pending/Claimable). */
  getDelegations(address: string): Promise<Delegations>;
  /**
   * Cheap base58-keyed witness lookup (no brokerage/APR fetch), used by the fee service's
   * assertVote to confirm a target SR exists. Not part of the shared SDK contract — Tron-only.
   */
  getWitnessMap(): Promise<Map<string, Validator>>;
}
