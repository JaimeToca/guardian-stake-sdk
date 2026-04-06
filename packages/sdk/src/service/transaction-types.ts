import type { Validator } from "./staking-types";
import type { GuardianChain } from "../chain";

export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimTransaction;

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

export const TransactionType = {
  Delegate: "Delegate",
  Undelegate: "Undelegate",
  Redelegate: "Redelegate",
  Claim: "Claim",
} as const;
export type TransactionType = typeof TransactionType[keyof typeof TransactionType];

export interface DelegateTransaction extends BaseTransaction {
  type: typeof TransactionType.Delegate;
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: typeof TransactionType.Undelegate;
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface RedelegateTransaction extends BaseTransaction {
  type: typeof TransactionType.Redelegate;
  isMaxAmount: boolean;
  fromValidator: Validator | OperatorAddress;
  toValidator: Validator | OperatorAddress;
}

export interface ClaimTransaction extends BaseTransaction {
  type: typeof TransactionType.Claim;
  validator: Validator | OperatorAddress;
  index: bigint;
}
