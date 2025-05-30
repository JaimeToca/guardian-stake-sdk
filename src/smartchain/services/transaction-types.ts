import { Chain } from "viem/_types/types/chain";
import { Validator } from "./staking-types";

export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimTransaction;

interface BaseTransaction {
  type: string;
  chain: Chain;
  amount: bigint;
}

export interface DelegateTransaction extends BaseTransaction {
  type: "delegate";
  isMaxAmount: boolean;
  validator: Validator;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: "undelegate";
  isMaxAmount: boolean;
  validator: Validator;
}

export interface RedelegateTransaction extends BaseTransaction {
  type: "redelegate";
  isMaxAmount: boolean;
  fromValidator: Validator;
  toValidator: Validator;
}

export interface ClaimTransaction extends BaseTransaction {
  type: "claim";
}
