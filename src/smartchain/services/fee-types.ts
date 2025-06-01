export interface GasFee {
    type: FeeType.GasFee,
    gasPrice: bigint,
    gasLimit: bigint,
    total: bigint,
}

// potentially more types in the future (Eip1559, etc..)
export type Fee = GasFee
export enum FeeType { GasFee }