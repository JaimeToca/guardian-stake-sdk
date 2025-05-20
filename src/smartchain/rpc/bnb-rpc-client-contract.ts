interface BNBRpcClientContract {
  getValidators(): Promise<BNBChainValidator[]>;
}
