import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";

/**
 * Defines the contract for a FeeService, ensuring consistent behavior for fee estimation.
 */
export interface FeeServiceContract {
  /**
   * Estimates the transaction fee for a given transaction.
   * @param transaction The transaction for which to estimate the fee.
   * @returns A Promise that resolves to a Fee object.
   */
  estimateFee(transaction: Transaction): Promise<Fee>;
}
