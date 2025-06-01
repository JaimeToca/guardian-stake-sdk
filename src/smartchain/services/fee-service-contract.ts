import { Fee, GasFee } from "./fee-types";
import { Transaction } from "./transaction-types";

export interface FeeServiceContract {
    estimateFee(transaction: Transaction): Fee
}