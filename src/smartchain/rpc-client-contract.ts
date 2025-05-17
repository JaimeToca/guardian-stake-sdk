interface RpcClientContract {
    getValidators(): Promise<SmartChainValidator[]>
}