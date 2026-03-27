import { Delegations, Validator } from "./staking-types";

/**
 * @interface StakingServiceContract
 * @description Defines the contract for a service responsible for interacting with blockchain staking functionalities.
 */
export interface StakingServiceContract {
  /**
   * @method getValidators
   * @description Retrieves a list of all active validators.
   * @returns {Promise<Validator[]>} A promise that resolves to an array of Validator objects.
   */
  getValidators(): Promise<Validator[]>;

  /**
   * @method getDelegations
   * @description Fetches the staking delegations made by a specific blockchain address.
   * @param {string} address - The blockchain address for which to retrieve delegation information.
   * @returns {Promise<Delegations>} A promise that resolves to an object containing the delegation details.
   */
  getDelegations(address: string): Promise<Delegations>;
}
