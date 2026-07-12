import type { Validator } from "./staking-types";
import type { GuardianChain } from "../chain";

export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimDelegateTransaction
  | ClaimRewardsTransaction
  | VoteTransaction;

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
  | "ClaimRewards"
  | "Vote";

export interface DelegateTransaction extends BaseTransaction {
  type: "Delegate";
  isMaxAmount: boolean;
  /** Optional: BSC/Cardano require it (enforced at runtime via assertValidator); Tron freeze omits it. */
  validator?: Validator | OperatorAddress;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: "Undelegate";
  isMaxAmount: boolean;
  /** Optional: BSC/Cardano require it; Tron unfreeze omits it. */
  validator?: Validator | OperatorAddress;
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
 * Supported by: BSC, Tron
 */
export interface ClaimDelegateTransaction extends BaseTransaction {
  type: "ClaimDelegate";
  /** Optional: BSC requires it (enforced at runtime via assertValidator); Tron ignores it. */
  validator?: Validator | OperatorAddress;
  /** Optional: BSC requires it; Tron ignores it. */
  index?: bigint;
}

/**
 * Withdraw accumulated staking rewards from the reward account to the wallet.
 * Requires an explicit transaction — rewards are not automatically moved.
 *
 * Supported by: Cardano, Tron
 */
export interface ClaimRewardsTransaction extends BaseTransaction {
  type: "ClaimRewards";
  /** Optional: Cardano requires it (enforced at runtime via assertValidator); Tron ignores it. */
  validator?: Validator | OperatorAddress;
}

/**
 * Vote staked Tron Power to a Super Representative. Tron-only.
 * `amount` is in SUN and must be a whole number of TRX (votes = amount / 1_000_000).
 *
 * Supported by: Tron
 */
export interface VoteTransaction extends BaseTransaction {
  type: "Vote";
  validator: Validator | OperatorAddress;
}
