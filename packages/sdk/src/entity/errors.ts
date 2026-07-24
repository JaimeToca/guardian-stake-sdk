/**
 * Typed error hierarchy for the Guardian SDK.
 *
 * All errors thrown by the SDK extend `GuardianError`, so callers can
 * catch the base type and still narrow to a specific subclass when needed:
 *
 * ```typescript
 * try {
 *   await sdk.getDelegations(chain, address);
 * } catch (err) {
 *   if (err instanceof ValidationError) {
 *     console.error(err.code, err.message);
 *   }
 * }
 * ```
 */

// ─── Error codes ─────────────────────────────────────────────────────────────

export type ValidationErrorCode =
  | "INVALID_ADDRESS"
  | "INVALID_AMOUNT"
  | "INVALID_NONCE"
  | "INVALID_FEE"
  | "INVALID_PRIVATE_KEY"
  | "INVALID_PAGE"
  | "INVALID_PAGE_SIZE"
  | "UNSUPPORTED_OPERATION"
  | "INVALID_VALIDATOR"
  | "INVALID_RESOURCE";

export type ConfigErrorCode = "UNSUPPORTED_CHAIN" | "INVALID_RPC_URL";

export type SigningErrorCode =
  | "INVALID_SIGNING_ARGS"
  | "INVALID_FEE_TYPE"
  | "UNSUPPORTED_TRANSACTION_TYPE";

/**
 * Broadcast-time failures. `BLOCKHASH_EXPIRED` is Solana-specific (the recent
 * blockhash embedded in the signed transaction is no longer valid) but lives in
 * the shared union so callers can narrow on `err.code` without a chain import.
 */
export type BroadcastErrorCode = "BLOCKHASH_EXPIRED";

export type ErrorCode =
  | ValidationErrorCode
  | ConfigErrorCode
  | SigningErrorCode
  | BroadcastErrorCode;

// ─── Base error ───────────────────────────────────────────────────────────────

/**
 * Base class for all errors thrown by the Guardian SDK.
 * Extend this class (or use one of the provided subclasses) to catch
 * SDK errors as a group.
 */
export class GuardianError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "GuardianError";
    this.code = code;

    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ─── Subclasses ───────────────────────────────────────────────────────────────

/**
 * Thrown when a caller provides an invalid argument (e.g. a bad address or
 * a zero/negative amount).
 */
export class ValidationError extends GuardianError {
  constructor(code: ValidationErrorCode, message: string) {
    super(code, message);
    this.name = "ValidationError";
  }
}

/**
 * Thrown when the SDK is misconfigured or asked to operate on an unsupported
 * chain (e.g. missing `sdkConfig.chains[chainId]`).
 */
export class ConfigError extends GuardianError {
  constructor(code: ConfigErrorCode, message: string) {
    super(code, message);
    this.name = "ConfigError";
  }
}

/**
 * Thrown when a signing operation fails due to invalid arguments, an
 * unsupported signer type, an unsupported transaction type, or a fee object
 * whose type does not match what the target chain expects.
 *
 * | Code | When |
 * |---|---|
 * | `INVALID_SIGNING_ARGS` | Missing or wrong key fields (no `privateKey`, no `account`, etc.) |
 * | `INVALID_FEE_TYPE` | Fee type mismatch — e.g. passing a `UtxoFee` to a BSC sign call |
 * | `UNSUPPORTED_TRANSACTION_TYPE` | Transaction `type` is not handled by this chain |
 */
export class SigningError extends GuardianError {
  constructor(code: SigningErrorCode, message: string) {
    super(code, message);
    this.name = "SigningError";
  }
}

/**
 * Thrown when broadcasting a signed transaction fails in a recoverable way the
 * caller may want to handle specially.
 *
 * | Code | When |
 * |---|---|
 * | `BLOCKHASH_EXPIRED` | The signed transaction's recent blockhash is no longer valid; re-sign (to embed a fresh blockhash) and rebroadcast. |
 */
export class BroadcastError extends GuardianError {
  constructor(code: BroadcastErrorCode, message: string) {
    super(code, message);
    this.name = "BroadcastError";
  }
}
