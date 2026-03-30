import type { BaseSignArgs, CallData, CompileArgs, PrehashResult, SigningWithPrivateKey } from "./sign-types";
import type { Transaction } from "./transaction-types";
import type { HexString } from "../entity/types";

/** Chain-agnostic contract for cryptographic signing operations. */
export interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey): Promise<HexString>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<HexString>;
  buildCallData(transaction: Transaction): Promise<CallData>;
}
