export type FeeType = "GasFee" | "UtxoFee" | "ResourceFee" | "SolanaFee";

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

/** Tron fee model: resource-based. `total` is the TRX (SUN) burned when free/available resources don't cover it. */
export interface ResourceFee {
  type: "ResourceFee";
  bandwidth: bigint;
  energy: bigint;
  total: bigint;
}

/** Solana fee model: base signature fee + optional priority (CU × microlamports/CU). `total` in lamports. */
export interface SolanaFee {
  type: "SolanaFee";
  computeUnits: bigint;
  computeUnitPrice: bigint;
  total: bigint;
}

export type Fee = GasFee | UtxoFee | ResourceFee | SolanaFee;
