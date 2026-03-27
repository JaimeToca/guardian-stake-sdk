import { Balance } from "./balance-types";

/** Contract for a service responsible for retrieving balances for a given address. */
export interface BalanceServiceContract {
  /**
   * Retrieves all balance categories for a blockchain address.
   * @param address The blockchain address to fetch balances for.
   */
  getBalances(address: string): Promise<Balance[]>;
}
