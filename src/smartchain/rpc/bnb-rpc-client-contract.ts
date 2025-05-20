interface BNBRpcClientContract {
  getValidators(): Promise<BNBChainValidator[]>;
  getStakingSummary(): Promise<BNBStakingSummary>;
}
