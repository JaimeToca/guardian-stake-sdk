import type { GuardianChain } from "../chain";
import { ConfigError } from "../entity/errors";
import type { Balance } from "../entity/balance-types";
import type { Fee } from "../entity/fee-types";
import type { GuardianServiceContract } from "../service/guardian-service-contract";
import type {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "../entity/sign-types";
import type { Delegations, Validator, ValidatorStatus } from "../entity/staking-types";
import type { Transaction } from "../entity/transaction-types";

/**
 * The primary interface for interacting with supported blockchains.
 * Accepts an array of chain service factories — one per chain you want to use.
 *
 * @example
 * ```typescript
 * import { GuardianSDK } from "@guardian/sdk";
 * import { bsc, chains } from "@guardian/bsc";
 *
 * const sdk = new GuardianSDK([
 *   bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
 * ]);
 *
 * const validators = await sdk.getValidators(chains.bscMainnet);
 * ```
 */
export class GuardianSDK {
  private services: Map<string, GuardianServiceContract>;

  constructor(services: GuardianServiceContract[]) {
    this.services = new Map(services.map((s) => [s.getChainInfo().id, s]));
  }

  getValidators(
    chain: GuardianChain,
    status?: ValidatorStatus | ValidatorStatus[]
  ): Promise<Validator[]> {
    return this.getService(chain).getValidators(status);
  }

  getDelegations(chain: GuardianChain, address: string): Promise<Delegations> {
    return this.getService(chain).getDelegations(address);
  }

  getBalances(chain: GuardianChain, address: string): Promise<Balance[]> {
    return this.getService(chain).getBalances(address);
  }

  getNonce(chain: GuardianChain, address: string): Promise<number> {
    return this.getService(chain).getNonce(address);
  }

  estimateFee(transaction: Transaction): Promise<Fee> {
    return this.getService(transaction.chain).estimateFee(transaction);
  }

  sign(signingArgs: SigningWithPrivateKey): Promise<string> {
    return this.getService(signingArgs.transaction.chain).sign(signingArgs);
  }

  preHash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.getService(preHashArgs.transaction.chain).prehash(preHashArgs);
  }

  compile(compileArgs: CompileArgs): Promise<string> {
    return this.getService(compileArgs.signArgs.transaction.chain).compile(compileArgs);
  }

  broadcast(chain: GuardianChain, rawTx: string): Promise<string> {
    return this.getService(chain).broadcast(rawTx);
  }

  private getService(chain: GuardianChain): GuardianServiceContract {
    const service = this.services.get(chain.id);
    if (!service) {
      throw new ConfigError(
        "UNSUPPORTED_CHAIN",
        `No service registered for chain "${chain.id}". Did you pass it to the GuardianSDK constructor?`
      );
    }
    return service;
  }
}
