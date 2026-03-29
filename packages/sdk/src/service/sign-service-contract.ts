import type { BaseSignArgs, CallData, CompileArgs, PrehashResult, SigningWithPrivateKey } from "./sign-types";
import type { Transaction } from "./transaction-types";

/** Chain-agnostic contract for cryptographic signing operations. */
export interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  buildCallData(transaction: Transaction): Promise<CallData>;
}
