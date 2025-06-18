import { Address } from "viem";
import { Balance } from "./balance-types";

/**
 * @interface BalanceServiceContract
 * @description Defines the contract for a service responsible for retrieving cryptocurrency balances.
 * This interface ensures that any class implementing it will provide a standardized method
 * for fetching balances given a blockchain address.
 */
export interface BalanceServiceContract {
  /**
   * @method getBalances
   * @description Retrieves an array of balances for a specific blockchain address.
   * @param {Address} address - The blockchain address for which to fetch balances.
   * 'Address' type is expected to be defined elsewhere (e.g., a string representing a wallet address).
   * @returns {Promise<Balance[]>} A promise that resolves to an array of Balance objects.
   */
  getBalances(address: Address): Promise<Balance[]>;
}
