import type {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "../entity/sign-types";

/** Chain-agnostic contract for cryptographic signing operations. */
export interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
}
