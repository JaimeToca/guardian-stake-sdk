import type { Fee } from "./fee-types";
import type { Transaction } from "./transaction-types";

export interface BaseSignArgs {
  transaction: Transaction;
  fee: Fee;
  nonce: number;
}

export interface SigningWithPrivateKey extends BaseSignArgs {
  privateKey: string;
}

export interface CompileArgs {
  signArgs: BaseSignArgs;
  signature: string;
}

export interface PrehashResult {
  serializedTransaction: string;
  signArgs: BaseSignArgs;
}
