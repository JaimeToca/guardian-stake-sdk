import type { BNBChainValidator, BNBStakingSummary } from "./bnb-rpc-types";

export interface BNBRpcClientContract {
  getValidators(params: { page: number; pageSize: number }): Promise<{
    validators: BNBChainValidator[];
    total: number;
  }>;
  getStakingSummary(): Promise<BNBStakingSummary>;
}
