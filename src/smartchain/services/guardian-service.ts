import { Address, Hex } from "viem";
import { GuardianChain } from "../../common/chain";
import { Balance } from "../../common/service/balance-types";
import { Fee } from "../../common/service/fee-types";
import { GuardianServiceContract } from "../../common/service/guardian-service-contract";
import {
  SigningWithPrivateKey,
  SigningWithAccount,
  BaseSignArgs,
  PrehashResult,
  CompileArgs,
} from "../../common/service/sign-types";
import { Transaction } from "../../common/service/transaction-types";
import {
  BalanceServiceContract,
  Delegations,
  FeeServiceContract,
  NonceServiceContract,
  SignServiceContract,
  StakingServiceContract,
  Validator,
} from "../../common";

/**
 * @interface GuardianServiceContract
 * Defines the contract for the GuardianService, outlining the methods it must implement.
 */
export class GuardianService implements GuardianServiceContract {
  /**
   * @constructor
   * @param {GuardianChain} chain - Provides information about the blockchain network.
   * @param {BalanceServiceContract} balanceService - Handles retrieving account balances.
   * @param {NonceServiceContract} nonceService - Manages transaction nonces for an address.
   * @param {FeeServiceContract} feeService - Provides functionality for estimating transaction fees.
   * @param {SignServiceContract} signService - Handles cryptographic signing operations.
   * @param {StakingServiceContract} stakingService - Manages interactions related to staking, like validators and delegations.
   */
  constructor(
    private chain: GuardianChain,
    private balanceService: BalanceServiceContract,
    private nonceService: NonceServiceContract,
    private feeService: FeeServiceContract,
    private signService: SignServiceContract,
    private stakingService: StakingServiceContract
  ) {}

  /**
   * Retrieves a list of all active validators on the network.
   * @returns {Promise<Validator[]>} A promise that resolves to an array of validator objects.
   */
  getValidators(): Promise<Validator[]> {
    return this.stakingService.getValidators();
  }

  /**
   * Retrieves the staking delegations for a given address.
   * @param {Address} address - The blockchain address to query for delegations.
   * @returns {Promise<Delegations>} A promise that resolves to the delegation information for the address.
   */
  getDelegations(address: Address): Promise<Delegations> {
    return this.stakingService.getDelegations(address);
  }

  /**
   * Returns information about the configured blockchain chain.
   * @returns {GuardianChain} An object containing details about the blockchain chain.
   */
  getChainInfo(): GuardianChain {
    return this.chain;
  }

  /**
   * Retrieves the balances for a given address across different assets.
   * @param {Address} address - The blockchain address to query for balances.
   * @returns {Promise<Balance[]>} A promise that resolves to an array of balance objects.
   */
  getBalances(address: Address): Promise<Balance[]> {
    return this.balanceService.getBalances(address);
  }

  /**
   * Retrieves the current transaction nonce for a given address.
   * The nonce is used to prevent transaction replay attacks and ensure transaction order.
   * @param {Address} address - The blockchain address to query for its nonce.
   * @returns {Promise<number>} A promise that resolves to the current nonce.
   */
  getNonce(address: Address): Promise<number> {
    return this.nonceService.getNonce(address);
  }

  /**
   * Estimates the transaction fee for a given transaction.
   * @param {Transaction} transaction - The transaction object for which to estimate the fee.
   * @returns {Promise<Fee>} A promise that resolves to the estimated fee.
   */
  estimateFee(transaction: Transaction): Promise<Fee> {
    return this.feeService.estimateFee(transaction);
  }

  /**
   * Signs a transaction or message using either a private key or an account.
   * @param {SigningWithPrivateKey | SigningWithAccount} signingArgs - The arguments required for signing, either a private key or account details.
   * @returns {Promise<Hex>} A promise that resolves to the signed data in hexadecimal format.
   */
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
    return this.signService.sign(signingArgs);
  }

  /**
   * Computes the pre-hash of transaction data before final signing.
   * This is often an intermediate step in the signing process.
   * @param {BaseSignArgs} preHasArgs - The base arguments for pre-hashing.
   * @returns {Promise<PrehashResult>} A promise that resolves to the pre-hash result.
   */
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    return this.signService.prehash(preHasArgs);
  }

  /**
   * Compiles transaction data into a format suitable for execution on the blockchain.
   * @param {CompileArgs} compileArgs - The arguments required for compilation.
   * @returns {Promise<Hex>} A promise that resolves to the compiled data in hexadecimal format.
   */
  compile(compileArgs: CompileArgs): Promise<Hex> {
    return this.signService.compile(compileArgs);
  }

  /**
   * Builds the call data and amount for a given transaction.
   * This prepares the raw data and value to be sent with a transaction.
   * @param {Transaction} transaction - The transaction object from which to build call data.
   * @returns {{ data: Hex; amount: bigint }} An object containing the hexadecimal call data and the transaction amount as a bigint.
   */
  buildCallData(transaction: Transaction): { data: Hex; amount: bigint } {
    return this.signService.buildCallData(transaction);
  }
}
