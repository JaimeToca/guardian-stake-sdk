export type FeeType = "GasFee" | "UtxoFee";

export interface GasFee {
  type: "GasFee";
  gasPrice: bigint;
  gasLimit: bigint;
  total: bigint;
}

/**
 * Cardano fee model: fee = minFeeA × txSizeInBytes + minFeeB.
 * There is no gas price — the total is fixed once the transaction is built.
 */
export interface UtxoFee {
  type: "UtxoFee";
  /** Estimated transaction size in bytes (used for fee calculation). */
  txSizeBytes: number;
  /** Total fee in lovelaces (1 ADA = 1_000_000 lovelaces). */
  total: bigint;
}

export type Fee = GasFee | UtxoFee;
