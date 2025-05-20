interface BNBRpcClientContract {
  getValidators(): Promise<SmartChainValidator[]>;
}
