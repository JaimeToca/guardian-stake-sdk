import { Cardano, Serialization } from "@cardano-sdk/core";
import type { Transaction } from "@guardian-sdk/sdk";
import { ValidationError, SigningError } from "@guardian-sdk/sdk";
import { buildRewardAccount, parsePoolId } from "../validations";
import type { CardanoCertificate } from "./tx-builder";

/** Fixed UTxO map entry overhead: 20 words × 8 bytes per word. */
const MIN_UTXO_OVERHEAD = 160;

/**
 * Returns the byte length of a CBOR-encoded unsigned integer.
 * CBOR major type 0: 1 byte for 0-23, 2 for 24-255, 3 for 256-65535,
 * 5 for 65536-4294967295, 9 for larger values.
 */
function cborUintSize(n: bigint): number {
  if (n < 24n) return 1;
  if (n < 0x100n) return 2;
  if (n < 0x10000n) return 3;
  if (n < 0x100000000n) return 5;
  return 9;
}

/**
 * Computes the minimum lovelace required for a pure-ADA change output at the given address.
 *
 * Uses the Babbage-era formula: `(serializedOutputSize + 160) × coinsPerUtxoByte`.
 * The serialized output size is computed from the actual address bytes (not a fixed constant),
 * and the result is refined iteratively to account for the fact that the minimum ADA amount
 * itself changes the CBOR encoding size of the coin field.
 *
 * Mirrors the algorithm used in @cardano-sdk/tx-construction `minAdaRequired`.
 */
export function computeMinOutputLovelace(paymentAddress: string, coinsPerUtxoByte: bigint): bigint {
  const placeholder: Cardano.TxOut = {
    address: Cardano.PaymentAddress(paymentAddress),
    value: { coins: 1n },
  };

  // Compute the serialized output size once — it is constant regardless of the coin value
  // because the size difference from the coin CBOR is tracked separately via sizeDiff.
  const outputSize = Serialization.TransactionOutput.fromCore(placeholder).toCbor().length / 2;
  const baseCoinSize = cborUintSize(1n);

  let latestCoinSize = baseCoinSize;
  let isDone = false;

  while (!isDone) {
    const sizeDiff = latestCoinSize - baseCoinSize;
    const tentativeMinAda = BigInt(outputSize + MIN_UTXO_OVERHEAD + sizeDiff) * coinsPerUtxoByte;
    const newCoinSize = cborUintSize(tentativeMinAda);
    isDone = latestCoinSize === newCoinSize;
    latestCoinSize = newCoinSize;
  }

  const sizeChange = latestCoinSize - baseCoinSize;
  return BigInt(outputSize + MIN_UTXO_OVERHEAD + sizeChange) * coinsPerUtxoByte;
}

/**
 * Builds the staking certificates for a transaction.
 *
 * @param stakeKeyHashHex - 56-char hex stake key hash. Pass `"00".repeat(28)` for fee estimation.
 * @param isStakeKeyRegistered - Whether the stake key is already registered on-chain.
 *   Pass `false` for fee estimation (worst-case: registration cert included).
 */
export function buildCertificates(
  transaction: Transaction,
  stakeKeyHashHex: string,
  isStakeKeyRegistered: boolean
): CardanoCertificate[] {
  if (transaction.type === "Delegate") {
    const poolId =
      typeof transaction.validator === "string"
        ? transaction.validator
        : transaction.validator.operatorAddress;
    const poolKeyHashHex = parsePoolId(poolId);
    const certs: CardanoCertificate[] = [];
    if (!isStakeKeyRegistered) {
      certs.push({ type: "StakeRegistration", stakeKeyHashHex });
    }
    certs.push({ type: "StakeDelegation", stakeKeyHashHex, poolKeyHashHex });
    return certs;
  }

  if (transaction.type === "Redelegate") {
    const poolId =
      typeof transaction.toValidator === "string"
        ? transaction.toValidator
        : transaction.toValidator.operatorAddress;
    const poolKeyHashHex = parsePoolId(poolId);
    return [{ type: "StakeDelegation", stakeKeyHashHex, poolKeyHashHex }];
  }

  if (transaction.type === "Undelegate") {
    return [{ type: "StakeDeregistration", stakeKeyHashHex }];
  }

  return [];
}

/**
 * How much to move from the reward account into the wallet for this transaction.
 *
 * Background: Cardano keeps staking rewards in a separate reward account (stake1...).
 * Moving rewards back into the wallet requires an explicit "withdrawal" field in the tx body.
 *
 * - Claim: the user explicitly requested a reward payout — use the requested amount.
 * - Undelegate: the protocol refuses to deregister a stake key while the reward account
 *   is non-empty, so we must sweep whatever is sitting there in the same transaction.
 * - Everything else: no rewards move.
 */
export function rewardAccountWithdrawal(
  transaction: Transaction,
  rewardsAvailableToSweep: bigint
): bigint {
  if (transaction.type === "ClaimRewards") return transaction.amount;
  if (transaction.type === "Undelegate") return rewardsAvailableToSweep;
  return 0n;
}

/**
 * Builds the withdrawals map that goes into the Cardano tx body.
 * An entry here instructs the node to move `amount` lovelaces from the reward
 * account to the wallet as part of this transaction.
 *
 * @param stakeKeyHashHex - 56-char hex stake key hash. Pass `"00".repeat(28)` for fee estimation.
 * @param rewardsAvailableToSweep - On-chain reward balance, used only for Undelegate.
 */
export function buildWithdrawals(
  transaction: Transaction,
  stakeKeyHashHex: string,
  rewardsAvailableToSweep = 0n
): Map<string, bigint> {
  if (transaction.type === "ClaimRewards" && transaction.amount <= 0n) {
    throw new ValidationError("INVALID_AMOUNT", "Claim amount must be greater than zero.");
  }

  const amount = rewardAccountWithdrawal(transaction, rewardsAvailableToSweep);
  if (amount === 0n) return new Map();

  return new Map([[buildRewardAccount(stakeKeyHashHex), amount]]);
}

/**
 * Computes the lovelaces that must be covered by UTXOs (excluding change).
 *
 * @param isStakeKeyRegistered - Whether the stake key is already registered.
 *   Pass `false` for fee estimation (worst-case: registration deposit included).
 */
export function computeRequiredLovelaces(
  transaction: Transaction,
  fee: bigint,
  keyDeposit: bigint,
  isStakeKeyRegistered: boolean
): bigint {
  switch (transaction.type) {
    case "Delegate":
      return fee + (isStakeKeyRegistered ? 0n : keyDeposit);
    case "Redelegate":
    case "Undelegate":
    case "ClaimRewards":
      return fee;
    default:
      throw new SigningError(
        "UNSUPPORTED_TRANSACTION_TYPE",
        `computeRequiredLovelaces: unsupported transaction type "${(transaction as { type: string }).type}" on Cardano.`
      );
  }
}
