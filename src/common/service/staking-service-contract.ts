import { Address } from "viem";
import { Delegations, Validator } from "./staking-types";

/**
 * @interface StakingServiceContract
 * @description Defines the contract for a service responsible for interacting with blockchain staking functionalities.
 * This interface outlines methods for querying validator information and user delegation details.
 */
export interface StakingServiceContract {
  /**
   * @method getValidators
   * @description Retrieves a list of all active validators participating in the staking mechanism of the blockchain.
   * Validators are responsible for validating transactions and maintaining the network.
   * @returns {Promise<Validator[]>} A promise that resolves to an array of Validator objects.
   */
  getValidators(): Promise<Validator[]>;

  /**
   * @method getDelegations
   * @description Fetches the staking delegations made by a specific blockchain address.
   * Delegations represent the amount of tokens an address has staked with particular validators.
   * @param {Address} address - The blockchain address for which to retrieve delegation information.
   * @returns {Promise<Delegations>} A promise that resolves to an object containing the delegation details.
   */
  getDelegations(address: Address): Promise<Delegations>;
}