import type { Validator } from "./staking-types";
import type { GuardianChain } from "../chain";

export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimDelegateTransaction
  | ClaimRewardsTransaction;

/**
 * Represents the on-chain address of a Validator Operator.
 */
export type OperatorAddress = string;

interface BaseTransaction {
  type: TransactionType;
  chain: GuardianChain;
  amount: bigint;
  account?: string | undefined;
}

export type TransactionType =
  | "Delegate"
  | "Undelegate"
  | "Redelegate"
  | "ClaimDelegate"
  | "ClaimRewards";

export interface DelegateTransaction extends BaseTransaction {
  type: "Delegate";
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: "Undelegate";
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface RedelegateTransaction extends BaseTransaction {
  type: "Redelegate";
  isMaxAmount: boolean;
  fromValidator: Validator | OperatorAddress;
  toValidator: Validator | OperatorAddress;
}

/**
 * Claim unbonded funds after the unbonding period has completed.
 * The amount sits in the validator's contract until this transaction is submitted.
 *
 * Supported by: BSC
 */
export interface ClaimDelegateTransaction extends BaseTransaction {
  type: "ClaimDelegate";
  validator: Validator | OperatorAddress;
  index: bigint;
}

/**
 * Withdraw accumulated staking rewards from the reward account to the wallet.
 * Requires an explicit transaction — rewards are not automatically moved.
 *
 * Supported by: Cardano
 */
export interface ClaimRewardsTransaction extends BaseTransaction {
  type: "ClaimRewards";
  validator: Validator | OperatorAddress;
  index: bigint;
}
