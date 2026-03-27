import type { GuardianChain } from "@guardian/sdk";
import type { Balance } from "@guardian/sdk";
import type { Fee } from "@guardian/sdk";
import type { GuardianServiceContract } from "@guardian/sdk";
import type {
  SigningWithPrivateKey,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
} from "@guardian/sdk";
import type { Transaction } from "@guardian/sdk";
import type {
  BalanceServiceContract,
  Delegations,
  FeeServiceContract,
  NonceServiceContract,
  StakingServiceContract,
  Validator,
} from "@guardian/sdk";
import type { SigningWithAccount } from "../sign-types";
import type { SignService } from "./sign-service";

/**
 * BSC implementation of `GuardianServiceContract`.
 * Extends the base `sign()` contract to also accept a viem `PrivateKeyAccount`
 * via `SigningWithAccount` — a BSC-specific convenience.
 */
export class GuardianService implements GuardianServiceContract {
  constructor(
    private readonly chain: GuardianChain,
    private balanceService: BalanceServiceContract,
    private nonceService: NonceServiceContract,
    private feeService: FeeServiceContract,
    private signService: SignService,
    private stakingService: StakingServiceContract
  ) {}

  getValidators(): Promise<Validator[]> {
    return this.stakingService.getValidators();
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

  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<string> {
    return this.signService.sign(signingArgs);
  }

  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.signService.prehash(preHashArgs);
  }

  compile(compileArgs: CompileArgs): Promise<string> {
    return this.signService.compile(compileArgs);
  }
}
