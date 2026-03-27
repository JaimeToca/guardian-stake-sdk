import { HexString } from "../entity/types";
import { PrivateKey } from "../entity/private-key";
import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";

export type BaseSignArgs = {
  transaction: Transaction;
  fee: Fee;
  nonce: number;
};

export type SigningWithPrivateKey = BaseSignArgs & { privateKey: PrivateKey };

export type CompileArgs = {
  signArgs: BaseSignArgs;
  r: HexString;
  s: HexString;
  v: bigint;
};

export type PrehashResult = {
  serializedTransaction: HexString;
  signArgs: BaseSignArgs;
};
