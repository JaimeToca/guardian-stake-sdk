import type { Transaction } from "@guardian-sdk/sdk";
import { buildRewardAccount, parsePoolId } from "../validations";
import type { CardanoCertificate } from "./tx-builder";

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
 * Builds the reward withdrawals map for a Claim transaction.
 *
 * @param stakeKeyHashHex - 56-char hex stake key hash. Pass `"00".repeat(28)` for fee estimation.
 */
export function buildWithdrawals(
  transaction: Transaction,
  stakeKeyHashHex: string
): Map<string, bigint> {
  if (transaction.type !== "Claim") return new Map();
  const rewardAccount = buildRewardAccount(stakeKeyHashHex);
  return new Map([[rewardAccount, transaction.amount]]);
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
    case "Claim":
      return fee;
  }
}
