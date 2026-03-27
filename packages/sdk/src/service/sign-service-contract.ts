import { HexString } from "../entity/types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "./sign-types";
import { Transaction } from "./transaction-types";

/**
 * @interface SignServiceContract
 * @description Defines the chain-agnostic contract for cryptographic signing operations.
 */
export interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  buildCallData(transaction: Transaction): { data: HexString; amount: bigint };
}
