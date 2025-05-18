interface EthersRpcClientContract {
    getValidatorsCreditContracts(contract: string): Promise<Map<string, string>>
    getClaimableUnbondDelegation(contract: string, address: string): void
    getPendingUnbondDelegation(contract: string, address: string): void
    getPooledBNBData(contract: string, address: string): void
    getSharesByPooledBNBData(contract: string, amount: bigint): void
} 