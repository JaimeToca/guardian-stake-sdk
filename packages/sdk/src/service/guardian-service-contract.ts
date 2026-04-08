import type { GuardianChain } from "../chain";
import type { Balance } from "../entity/balance-types";
import type { Transaction } from "../entity/transaction-types";
import type { Fee } from "../entity/fee-types";
import type {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "../entity/sign-types";
import type { Delegations, Validator, ValidatorStatus } from "../entity/staking-types";
/** Chain-agnostic contract for the Guardian Service facade. Implemented by each chain package. */
export interface GuardianServiceContract {
  getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]>;
  getDelegations(address: string): Promise<Delegations>;
  getBalances(address: string): Promise<Balance[]>;
  getNonce(address: string): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  broadcast(rawTx: string): Promise<string>;
  getChainInfo(): GuardianChain;
}
