import type { PrivateKey } from "../entity/private-key";
import type { Fee } from "./fee-types";
import type { Transaction } from "./transaction-types";

export type BaseSignArgs = {
  transaction: Transaction;
  fee: Fee;
  nonce: number;
};

export type SigningWithPrivateKey = BaseSignArgs & { privateKey: PrivateKey };

export type CompileArgs = {
  signArgs: BaseSignArgs;
  signature: string;
};

export type PrehashResult = {
  serializedTransaction: string;
  signArgs: BaseSignArgs;
};
