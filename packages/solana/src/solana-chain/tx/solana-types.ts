import type {
  BaseSignArgs,
  ClaimDelegateTransaction,
  UndelegateTransaction,
} from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";

/** 1 SOL = 1_000_000_000 lamports. Re-exported for package consumers. */
export { LAMPORTS_PER_SOL } from "../state/constants";

/**
 * JSON-RPC options forwarded to `sendTransaction`. Set via `SolanaConfig.broadcastOptions`.
 * With `skipPreflight: true` the node will not surface an expired blockhash synchronously,
 * so the caller must run their own confirm-and-retry loop instead of catching BLOCKHASH_EXPIRED.
 */
export interface SolanaSendTransactionOptions {
  /** Skip the preflight simulation/checks (default false). */
  skipPreflight?: boolean;
  /** Commitment used for preflight. */
  preflightCommitment?: "processed" | "confirmed" | "finalized";
  /** Max node-side resend attempts before the tx is dropped. */
  maxRetries?: number;
  /** Minimum slot the request should be evaluated at. */
  minContextSlot?: bigint;
}

export interface SolanaUndelegateTransaction extends UndelegateTransaction {
  /** Base58 stake account pubkey to deactivate. */
  stakeAccount: string;
}

export interface SolanaClaimDelegateTransaction extends ClaimDelegateTransaction {
  /** Base58 stake account pubkey to withdraw/close. */
  stakeAccount: string;
}

/**
 * Thread unsigned message through prehash → compile (mirrors Tron `_rawTx`).
 * Implementation stores enough to reattach signatures without rebuilding.
 */
export interface SolanaSignArgs extends BaseSignArgs {
  /** Compiled transaction message bytes (Ed25519 sign payload). */
  _messageBytes?: Uint8Array;
  /** Base64 wire-ready skeleton; exact field set is internal. */
  _wireTransaction?: string;
}

export interface BuildTxResult {
  /** Compiled message bytes (Ed25519 payload). */
  messageBytes: Uint8Array;
  /** Base64 unsigned wire transaction (zeroed signatures). */
  wireTransactionBase64: string;
  /** Fee payer / authority address. */
  feePayer: string;
  /** Recent blockhash embedded in the message. */
  recentBlockhash: string;
}

/** Subset of SolanaConfig used by the transaction builder (avoids circular imports). */
export interface BuildTxConfig {
  seedScanMax?: number;
  defaultComputeUnitPrice?: bigint;
}

export interface BuildTxDeps {
  rpc: SolanaRpcClientContract;
  /** Fee payer = staker = withdrawer (v1). */
  authorityAddress: string;
  config?: BuildTxConfig;
  /**
   * Override priority fee (microlamports/CU); falls back to fee.computeUnitPrice / config,
   * then to DEFAULT_COMPUTE_UNIT_PRICE (100_000).
   */
  computeUnitPrice?: bigint;
  /**
   * Skip the Delegate funding sufficiency assertion. Set by fee estimation so a
   * fee can be quoted before the wallet is funded (message size is independent of
   * balance). Signing keeps it off so under-funded Delegates still fail fast.
   */
  skipBalanceCheck?: boolean;
}
