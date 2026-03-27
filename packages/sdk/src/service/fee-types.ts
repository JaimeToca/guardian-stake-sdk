export enum FeeType {
  GasFee = "GasFee",
}

export interface GasFee {
  type: FeeType.GasFee;
  gasPrice: bigint;
  gasLimit: bigint;
  total: bigint;
}

export type Fee = GasFee;
