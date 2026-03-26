import { Address, isAddress } from "viem";
import { GuardianChain } from "../../common/chain";
import { Balance } from "../../common/service/balance-types";
import { Fee } from "../../common/service/fee-types";
import { GuardianServiceContract } from "../../common/service/guardian-service-contract";
import {
  SigningWithPrivateKey,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
  HexString,
} from "../../common";
import { Transaction } from "../../common/service/transaction-types";
import {
  BalanceServiceContract,
  Delegations,
  FeeServiceContract,
  NonceServiceContract,
  StakingServiceContract,
  Validator,
} from "../../common";
import { SigningWithAccount } from "../sign-types";
import { SignService } from "./sign-service";

/**
 * BSC implementation of `GuardianServiceContract`.
 * Extends the base `sign()` contract to also accept a viem `PrivateKeyAccount`
 * via `SigningWithAccount` — a BSC-specific convenience.
 */
export class GuardianService implements GuardianServiceContract {
  /**
   * @constructor
   * @param {GuardianChain} chain - Provides information about the blockchain network.
   * @param {BalanceServiceContract} balanceService - Handles retrieving account balances.
   * @param {NonceServiceContract} nonceService - Manages transaction nonces for an address.
   * @param {FeeServiceContract} feeService - Provides functionality for estimating transaction fees.
   * @param {SignService} signService - BSC signing service; accepts both private key and viem account.
   * @param {StakingServiceContract} stakingService - Manages interactions related to staking.
   */
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
    return this.stakingService.getDelegations(address as Address);
  }

  isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  getChainInfo(): GuardianChain {
    return this.chain;
  }

  getBalances(address: string): Promise<Balance[]> {
    return this.balanceService.getBalances(address as Address);
  }

  getNonce(address: string): Promise<number> {
    return this.nonceService.getNonce(address as Address);
  }

  estimateFee(transaction: Transaction): Promise<Fee> {
    return this.feeService.estimateFee(transaction);
  }

  /**
   * Signs a transaction using either a raw private key or a viem `PrivateKeyAccount`.
   * The base contract only exposes `SigningWithPrivateKey`; `SigningWithAccount` is
   * a BSC-specific extension accessible via the concrete `GuardianService` type.
   */
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<string> {
    return this.signService.sign(signingArgs);
  }

  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.signService.prehash(preHasArgs);
  }

  compile(compileArgs: CompileArgs): Promise<string> {
    return this.signService.compile(compileArgs);
  }

  buildCallData(transaction: Transaction): { data: HexString; amount: bigint } {
    return this.signService.buildCallData(transaction);
  }
}
