import { FeeServiceContract } from "./fee-service-contract";
import { GasFee } from "./fee-types";
import { Transaction } from "./transaction-types";

export class FeeService implements FeeServiceContract {
  estimateFee(transaction: Transaction): GasFee {
    return {
      gasPrice: BigInt(0),
      gasLimit: BigInt(0),
      total: BigInt(0),
    };
  }
}
