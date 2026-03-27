import { Balance } from "./balance-types";

/**
 * @interface BalanceServiceContract
 * @description Defines the contract for a service responsible for retrieving cryptocurrency balances.
 */
export interface BalanceServiceContract {
  /**
   * @method getBalances
   * @description Retrieves an array of balances for a specific blockchain address.
   * @param {string} address - The blockchain address for which to fetch balances.
   * @returns {Promise<Balance[]>} A promise that resolves to an array of Balance objects.
   */
  getBalances(address: string): Promise<Balance[]>;
}
