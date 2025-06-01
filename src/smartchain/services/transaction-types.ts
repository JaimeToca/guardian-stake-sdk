import { Chain } from "viem/_types/types/chain";
import { Validator } from "./staking-types";
import { Address } from "viem";

export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimTransaction;

interface BaseTransaction {
  type: TransactionType;
  chain: Chain;
  to: Address;
  amount: bigint;
}

export enum TransactionType {
  Delegate,
  Undelegate,
  Redelegate,
  Claim,
}

export interface DelegateTransaction extends BaseTransaction {
  type: TransactionType.Delegate;
  isMaxAmount: boolean;
  validator: Validator;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: TransactionType.Undelegate;
  isMaxAmount: boolean;
  validator: Validator;
}

export interface RedelegateTransaction extends BaseTransaction {
  type: TransactionType.Redelegate;
  isMaxAmount: boolean;
  fromValidator: Validator;
  toValidator: Validator;
}

export interface ClaimTransaction extends BaseTransaction {
  type: TransactionType.Claim;
  validator: Validator;
  index: bigint;
}
