import type { GuardianChain } from "../chain";
import type { Balance } from "../entity/balance-types";
import type { Transaction } from "../entity/transaction-types";
import type { Fee } from "../entity/fee-types";
import type { BaseSignArgs, CompileArgs, PrehashResult } from "../entity/sign-types";
import type { Delegations, GetValidatorsParams, ValidatorsPage } from "../entity/staking-types";
/** Chain-agnostic contract for the Guardian Service facade. Implemented by each chain package. */
export interface GuardianServiceContract {
  getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage>;
  getDelegations(address: string): Promise<Delegations>;
  getBalances(address: string): Promise<Balance[]>;
  getNonce(address: string): Promise<number>;
  estimateFee(transaction: Transaction): Promise<Fee>;
  /**
   * Signs a transaction. The exact shape of `signingArgs` depends on the chain:
   * - BSC: pass `SigningWithPrivateKey` (`privateKey`) or `SigningWithAccount` (`account`)
   * - Cardano: pass `CardanoSigningWithPrivateKey` (`paymentPrivateKey` + `stakingPrivateKey`)
   *
   * Each chain's implementation validates at runtime and throws `SigningError` if:
   * - required key fields are missing → `INVALID_SIGNING_ARGS`
   * - fee type does not match the chain (e.g. `UtxoFee` passed to BSC) → `INVALID_FEE_TYPE`
   */
  sign(signingArgs: BaseSignArgs): Promise<string>;
  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
  broadcast(rawTx: string): Promise<string>;
  getChainInfo(): GuardianChain;
}
