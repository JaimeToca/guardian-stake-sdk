import type { BNBChainValidator, BNBStakingSummary } from "./bnb-rpc-types";

export interface BNBRpcClientContract {
  getValidators(): Promise<BNBChainValidator[]>;
  getStakingSummary(): Promise<BNBStakingSummary>;
}
