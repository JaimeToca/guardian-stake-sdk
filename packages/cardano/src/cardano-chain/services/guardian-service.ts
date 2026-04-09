import type { GuardianChain } from "@guardian-sdk/sdk";
import type { Balance } from "@guardian-sdk/sdk";
import type { Fee } from "@guardian-sdk/sdk";
import type { GuardianServiceContract } from "@guardian-sdk/sdk";
import type { BaseSignArgs, CompileArgs, PrehashResult } from "@guardian-sdk/sdk";
import type { Transaction } from "@guardian-sdk/sdk";
import type {
  BalanceServiceContract,
  BroadcastServiceContract,
  Delegations,
  FeeServiceContract,
  NonceServiceContract,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
} from "@guardian-sdk/sdk";
import type { SignService } from "./sign-service";

/**
 * Cardano implementation of `GuardianServiceContract`.
 *
 * The `sign()` method accepts `CardanoSigningWithPrivateKey` — a `BaseSignArgs`
 * extension with `paymentPrivateKey` and `stakingPrivateKey` fields:
 *
 * ```typescript
 * await sdk.sign({
 *   transaction, fee, nonce: 0,
 *   paymentPrivateKey: "64-hex-chars",
 *   stakingPrivateKey: "64-hex-chars",
 * });
 * ```
 */
export class GuardianService implements GuardianServiceContract {
  constructor(
    private readonly chain: GuardianChain,
    private readonly balanceService: BalanceServiceContract,
    private readonly nonceService: NonceServiceContract,
    private readonly feeService: FeeServiceContract,
    private readonly signService: SignService,
    private readonly stakingService: StakingServiceContract,
    private readonly broadcastService: BroadcastServiceContract
  ) {}

  getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]> {
    return this.stakingService.getValidators(status);
  }

  getDelegations(address: string): Promise<Delegations> {
    return this.stakingService.getDelegations(address);
  }

  getChainInfo(): GuardianChain {
    return this.chain;
  }

  getBalances(address: string): Promise<Balance[]> {
    return this.balanceService.getBalances(address);
  }

  getNonce(address: string): Promise<number> {
    return this.nonceService.getNonce(address);
  }

  estimateFee(transaction: Transaction): Promise<Fee> {
    return this.feeService.estimateFee(transaction);
  }

  sign(signingArgs: BaseSignArgs): Promise<string> {
    return this.signService.sign(signingArgs);
  }

  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.signService.prehash(preHashArgs);
  }

  compile(compileArgs: CompileArgs): Promise<string> {
    return this.signService.compile(compileArgs);
  }

  broadcast(rawTx: string): Promise<string> {
    return this.broadcastService.broadcast(rawTx);
  }
}
