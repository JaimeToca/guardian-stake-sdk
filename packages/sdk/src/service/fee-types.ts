export const FeeType = {
  GasFee: "GasFee",
} as const;
export type FeeType = typeof FeeType[keyof typeof FeeType];

export interface GasFee {
  type: typeof FeeType.GasFee;
  gasPrice: bigint;
  gasLimit: bigint;
  total: bigint;
}

export type Fee = GasFee;
