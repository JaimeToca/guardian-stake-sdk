export type FeeType = "GasFee";

export interface GasFee {
  type: "GasFee";
  gasPrice: bigint;
  gasLimit: bigint;
  total: bigint;
}

export type Fee = GasFee;
