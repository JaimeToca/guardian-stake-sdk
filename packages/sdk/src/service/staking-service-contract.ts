import type { Delegations, Validator, ValidatorStatus } from "../entity/staking-types";

/** Contract for a service responsible for staking operations. */
export interface StakingServiceContract {
  /**
   * Returns validators on the network.
   * Pass a status (or array of statuses) to filter; omit to return all.
   */
  getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]>;

  /**
   * Returns all delegations for the given address plus a protocol-level summary.
   * @param address The blockchain address to fetch delegations for.
   */
  getDelegations(address: string): Promise<Delegations>;
}
