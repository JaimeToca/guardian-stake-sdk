import { HexString } from "../entity/types";
import { GuardianChain } from "../chain";
import { Balance } from "./balance-types";
import { Transaction } from "./transaction-types";
import { Fee } from "./fee-types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "./sign-types";
import { Delegations, Validator } from "./staking-types";

/**
 * @interface GuardianServiceContract
 * @description Defines the chain-agnostic contract for the Guardian Service facade.
 * Chain-specific implementations may extend the `sign` method to accept additional
 * signer types beyond `SigningWithPrivateKey` (e.g., viem accounts for BSC).
 */
export interface GuardianServiceContract {
  /**
   * @method getValidators
   * @description Retrieves a list of all active validators on the blockchain network.
   * @returns {Promise<Validator[]>} A promise that resolves to an array of Validator objects.
   */
  getValidators(): Promise<Validator[]>;

  /**
   * @method getDelegations
   * @description Fetches the staking delegations associated with a specific blockchain address.
   * @param {string} address - The blockchain address for which to retrieve delegation information.
   * @returns {Promise<Delegations>} A promise that resolves to an object containing delegation details.
   */
  getDelegations(address: string): Promise<Delegations>;

  /**
   * @method getBalances
   * @description Retrieves an array of balances for a given blockchain address.
   * @param {string} address - The blockchain address for which to fetch balances.
   * @returns {Promise<Balance[]>} A promise that resolves to an array of Balance objects.
   */
  getBalances(address: string): Promise<Balance[]>;

  /**
   * @method getNonce
   * @description Fetches the current transaction nonce for a specific blockchain address.
   * @param {string} address - The blockchain address for which to get the nonce.
   * @returns {Promise<number>} A promise that resolves to the current nonce value.
   */
  getNonce(address: string): Promise<number>;

  /**
   * @method estimateFee
   * @description Estimates the transaction fee required for a given transaction.
   * @param {Transaction} transaction - The transaction object for which to estimate the fee.
   * @returns {Promise<Fee>} A promise that resolves to the estimated fee object.
   */
  estimateFee(transaction: Transaction): Promise<Fee>;

  /**
   * @method sign
   * @description Signs a transaction using a raw private key.
   * Chain-specific implementations may accept additional signer types.
   * @param {SigningWithPrivateKey} signingArgs - The transaction details and private key.
   * @returns {Promise<string>} A promise that resolves to the signed transaction as a hex string.
   */
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;

  /**
   * @method prehash
   * @description Computes an intermediate hash of transaction data before the final signing process.
   * @param {BaseSignArgs} preHasArgs - The base arguments used for computing the pre-hash.
   * @returns {Promise<PrehashResult>} A promise that resolves to the result of the pre-hashing operation.
   */
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;

  /**
   * @method compile
   * @description Compiles raw transaction data and a signature into a format suitable for blockchain submission.
   * @param {CompileArgs} compileArgs - The arguments necessary for the compilation process.
   * @returns {Promise<string>} A promise that resolves to the compiled transaction as a hex string.
   */
  compile(compileArgs: CompileArgs): Promise<string>;

  /**
   * @method buildCallData
   * @description Constructs the raw call data and amount required for a blockchain transaction.
   * @param {Transaction} transaction - The transaction object from which to build the call data.
   * @returns {{ data: HexString; amount: bigint }} An object containing the call data and amount.
   */
  buildCallData(
    transaction: Transaction
  ): {
    data: HexString;
    amount: bigint;
  };

  /**
   * @method isValidAddress
   * @description Validates whether the given string is a valid address for this chain.
   * Each chain implementation applies its own address format rules.
   * @param {string} address - The address string to validate.
   * @returns {boolean} `true` if the address is valid for this chain, `false` otherwise.
   */
  isValidAddress(address: string): boolean;

  /**
   * @method getChainInfo
   * @description Retrieves information about the blockchain chain this service is configured for.
   * @returns {GuardianChain} An object containing details about the chain.
   */
  getChainInfo(): GuardianChain;
}
