import type { GuardianChain } from "../chain";
import type { Balance } from "./balance-types";
import type { Transaction } from "./transaction-types";
import type { Fee } from "./fee-types";
import type { BaseSignArgs, CompileArgs, PrehashResult, SigningWithPrivateKey } from "./sign-types";
import type { Delegations, Validator } from "./staking-types";

/** Chain-agnostic contract for the Guardian Service facade. Implemented by each chain package. */
export interface GuardianServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: string): Promise<Delegations>;
  getBalances(address: string): Promise<Balance[]>;
  getNonce(address: string): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  getChainInfo(): GuardianChain;
}
