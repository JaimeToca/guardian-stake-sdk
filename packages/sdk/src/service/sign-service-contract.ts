import type { BaseSignArgs, CompileArgs, PrehashResult } from "../entity/sign-types";

/** Chain-agnostic contract for cryptographic signing operations. */
export interface SignServiceContract {
  sign(signingArgs: BaseSignArgs): Promise<string>;
  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
}
