import type {
  ClaimDelegateTransaction,
  DelegateTransaction,
  Transaction,
  UndelegateTransaction,
} from "@guardian-sdk/sdk";
import { assertValidator, SigningError, ValidationError } from "@guardian-sdk/sdk";
import { address } from "@solana/kit";
import type { SolanaClaimDelegateTransaction, SolanaUndelegateTransaction } from "./solana-types";

/** Reject Redelegate / ClaimRewards / Vote (and any future unknown type). */
export function assertSupportedTransactionType(tx: Transaction): void {
  switch (tx.type) {
    case "Delegate":
    case "Undelegate":
    case "ClaimDelegate":
      return;
    case "Redelegate":
    case "ClaimRewards":
    case "Vote":
      throw new SigningError(
        "UNSUPPORTED_TRANSACTION_TYPE",
        `Solana does not support transaction type "${tx.type}" in v1.`
      );
    default:
      throw new SigningError(
        "UNSUPPORTED_TRANSACTION_TYPE",
        `Solana does not support transaction type "${(tx as Transaction).type}".`
      );
  }
}

/**
 * Delegate: amount > 0, isMaxAmount false, validator present, account present.
 * Does not check minDelegation (RPC) — that lives in the builder.
 */
export function assertDelegate(tx: DelegateTransaction): void {
  if (!tx.account || tx.account.trim() === "") {
    throw new ValidationError(
      "INVALID_ADDRESS",
      "Delegate requires transaction.account (wallet / authority)."
    );
  }
  if (tx.isMaxAmount) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      "Solana does not support isMaxAmount; pass an exact lamport amount (query getBalances for max freeable)."
    );
  }
  if (tx.amount <= 0n) {
    throw new ValidationError("INVALID_AMOUNT", "Delegate amount must be greater than zero.");
  }
  assertValidator(tx);
}

/**
 * Require a non-empty base58 `stakeAccount` on undelegate / claim-delegate extensions.
 */
export function assertStakeAccount(
  tx:
    | UndelegateTransaction
    | ClaimDelegateTransaction
    | SolanaUndelegateTransaction
    | SolanaClaimDelegateTransaction
): asserts tx is (SolanaUndelegateTransaction | SolanaClaimDelegateTransaction) & {
  stakeAccount: string;
} {
  const stakeAccount =
    "stakeAccount" in tx && typeof (tx as { stakeAccount?: unknown }).stakeAccount === "string"
      ? (tx as { stakeAccount: string }).stakeAccount
      : undefined;

  if (!stakeAccount || stakeAccount.trim() === "") {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `${tx.type} requires stakeAccount (base58 stake account pubkey).`
    );
  }

  try {
    address(stakeAccount);
  } catch {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Invalid stakeAccount address: "${stakeAccount}".`
    );
  }
}

/** Best-effort base58 wallet/authority address check. */
export function assertAuthorityAddress(authorityAddress: string): void {
  if (!authorityAddress || authorityAddress.trim() === "") {
    throw new ValidationError("INVALID_ADDRESS", "authorityAddress is required.");
  }
  try {
    address(authorityAddress);
  } catch {
    throw new ValidationError(
      "INVALID_ADDRESS",
      `Invalid authority address: "${authorityAddress}".`
    );
  }
}
