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

export enum TransactionType {
  Delegate = "Delegate",
  Undelegate = "Undelegate",
  Redelegate = "Redelegate",
  Claim = "Claim",
}

export interface DelegateTransaction extends BaseTransaction {
  type: TransactionType.Delegate;
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: TransactionType.Undelegate;
  isMaxAmount: boolean;
  validator: Validator | OperatorAddress;
}

export interface RedelegateTransaction extends BaseTransaction {
  type: TransactionType.Redelegate;
  isMaxAmount: boolean;
  fromValidator: Validator | OperatorAddress;
  toValidator: Validator | OperatorAddress;
}

export interface ClaimTransaction extends BaseTransaction {
  type: TransactionType.Claim;
  validator: Validator | OperatorAddress;
  index: bigint;
}
