import { Hex } from "viem";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
} from "./sign-types";

export interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex>;
  prehash(preHasArgs: BaseSignArgs): PrehashResult;
  compile(compileArgs: CompileArgs): Hex;
}
