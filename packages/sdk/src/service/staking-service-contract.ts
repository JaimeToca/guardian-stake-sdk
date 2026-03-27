import type { Delegations, Validator } from "./staking-types";

/** Contract for a service responsible for staking operations. */
export interface StakingServiceContract {
  /** Returns all validators on the network — active, inactive, and jailed. */
  getValidators(): Promise<Validator[]>;

  /**
   * Returns all delegations for the given address plus a protocol-level summary.
   * @param address The blockchain address to fetch delegations for.
   */
  getDelegations(address: string): Promise<Delegations>;
}
