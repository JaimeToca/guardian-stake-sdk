import type { Delegations, GetValidatorsParams, ValidatorsPage } from "../entity/staking-types";

/** Contract for a service responsible for staking operations. */
export interface StakingServiceContract {
  /**
   * Returns a paginated page of validators.
   * Use `params.page` / `params.pageSize` for pagination (1-based page, default 20 per page).
   * Use `params.status` to filter by validator status.
   */
  getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage>;

  /**
   * Returns all delegations for the given address plus a protocol-level summary.
   * @param address The blockchain address to fetch delegations for.
   */
  getDelegations(address: string): Promise<Delegations>;
}
