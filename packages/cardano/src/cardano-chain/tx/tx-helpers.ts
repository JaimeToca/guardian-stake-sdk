import { Cardano, Serialization } from "@cardano-sdk/core";
import type { Transaction } from "@guardian-sdk/sdk";
import { SigningError } from "@guardian-sdk/sdk";
import { buildRewardAccount, parsePoolId } from "../validations";
import type { BlockfrostProtocolParams } from "../rpc/blockfrost-rpc-types";
import type { CardanoCertificate } from "./tx-builder";
import { DEFAULT_COINS_PER_UTXO_SIZE } from "./coin-selection";

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
    // A StakeDelegation certificate is only valid for a registered stake key.
    // Redelegate normally implies an existing registration, but guard the edge
    // case (first-time / previously-deregistered key) by prepending registration.
    const certs: CardanoCertificate[] = [];
    if (!isStakeKeyRegistered) {
      certs.push({ type: "StakeRegistration", stakeKeyHashHex });
    }
    certs.push({ type: "StakeDelegation", stakeKeyHashHex, poolKeyHashHex });
    return certs;
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
 * The Cardano ledger only allows a withdrawal to drain the **entire** reward-account
 * balance — partial withdrawals are rejected. Both flows therefore move the full
 * on-chain reward balance, never a caller-chosen partial amount:
 * - Claim: withdraw the whole reward balance into the wallet.
 * - Undelegate: the protocol refuses to deregister a stake key while the reward
 *   account is non-empty, so the same full balance is swept in the deregistration tx.
 * - Everything else: no rewards move.
 */
export function rewardAccountWithdrawal(transaction: Transaction, rewardsOnChain: bigint): bigint {
  if (transaction.type === "ClaimRewards" || transaction.type === "Undelegate") {
    return rewardsOnChain;
  }
  return 0n;
}

/**
 * Builds the withdrawals map that goes into the Cardano tx body.
 * An entry here instructs the node to move `amount` lovelaces from the reward
 * account to the wallet as part of this transaction.
 *
 * @param stakeKeyHashHex - 56-char hex stake key hash. Pass `"00".repeat(28)` for fee estimation.
 * @param rewardsOnChain - Full on-chain reward balance to withdraw (ClaimRewards + Undelegate).
 *   Request-level validation (amount > 0, sufficient rewards) happens upstream in the sign flow.
 */
export function buildWithdrawals(
  transaction: Transaction,
  stakeKeyHashHex: string,
  rewardsOnChain = 0n
): Map<string, bigint> {
  const amount = rewardAccountWithdrawal(transaction, rewardsOnChain);
  if (amount <= 0n) return new Map();

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
    case "Redelegate":
      // Both stake to a pool; a first-time/unregistered key must also pay the deposit.
      return fee + (isStakeKeyRegistered ? 0n : keyDeposit);
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

/**
 * Derives the UTXO selection target for a transaction: the minimum lovelace the
 * selected inputs must cover so that, after paying the fee (and any deposit), the
 * change output still satisfies the minimum-UTxO rule.
 *
 * `target = requiredLovelaces + minUtxo`. Shared by the paged collector (as its
 * stop threshold) and `buildBody`/`estimateTxSize` (for the change accounting) so
 * the two never drift.
 */
export function computeSelectionTarget(
  transaction: Transaction,
  fee: bigint,
  protocolParams: BlockfrostProtocolParams,
  isStakeKeyRegistered: boolean,
  paymentAddress: string
): { requiredLovelaces: bigint; minUtxo: bigint; target: bigint } {
  const keyDeposit = BigInt(protocolParams.key_deposit);
  const coinsPerUtxoByte = BigInt(
    protocolParams.coins_per_utxo_size ?? DEFAULT_COINS_PER_UTXO_SIZE
  );
  const minUtxo = computeMinOutputLovelace(paymentAddress, coinsPerUtxoByte);
  const requiredLovelaces = computeRequiredLovelaces(
    transaction,
    fee,
    keyDeposit,
    isStakeKeyRegistered
  );
  return { requiredLovelaces, minUtxo, target: requiredLovelaces + minUtxo };
}
