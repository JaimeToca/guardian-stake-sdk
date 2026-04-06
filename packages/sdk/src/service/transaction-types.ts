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

export type TransactionType = "Delegate" | "Undelegate" | "Redelegate" | "Claim";

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

export interface ClaimTransaction extends BaseTransaction {
  type: "Claim";
  validator: Validator | OperatorAddress;
  index: bigint;
}
