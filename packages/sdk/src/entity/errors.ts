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

export enum ValidationErrorCode {
  INVALID_ADDRESS = "INVALID_ADDRESS",
  INVALID_AMOUNT = "INVALID_AMOUNT",
  INVALID_NONCE = "INVALID_NONCE",
  INVALID_FEE = "INVALID_FEE",
}

export enum ConfigErrorCode {
  UNSUPPORTED_CHAIN = "UNSUPPORTED_CHAIN",
}

export enum SigningErrorCode {
  INVALID_SIGNING_ARGS = "INVALID_SIGNING_ARGS",
  UNSUPPORTED_TRANSACTION_TYPE = "UNSUPPORTED_TRANSACTION_TYPE",
}

export type ErrorCode = ValidationErrorCode | ConfigErrorCode | SigningErrorCode;

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
 * unsupported signer type, or an unsupported transaction type.
 */
export class SigningError extends GuardianError {
  constructor(code: SigningErrorCode, message: string) {
    super(code, message);
    this.name = "SigningError";
  }
}
