import { Address, Hex } from "viem";
import { GuardianChain } from "../chain";
import { Balance } from "./balance-types";
import { Transaction } from "./transaction-types";
import { Fee } from "./fee-types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
} from "./sign-types";
import { Delegations, Validator } from "./staking-types";

/**
 * @interface GuardianServiceContract
 * @description Defines the comprehensive contract for the Guardian Service,
 * which acts as a central facade for various blockchain-related operations.
 * This interface ensures consistency and provides a single point of interaction
 * for functionalities like staking, balance inquiry, transaction management, and signing.
 */
export interface GuardianServiceContract {
  /**
   * @method getValidators
   * @description Retrieves a list of all active validators on the blockchain network.
   * @returns {Promise<Validator[]>} A promise that resolves to an array of Validator objects.
   * 'Validator' type is expected to be defined elsewhere, detailing validator information.
   */
  getValidators(): Promise<Validator[]>;

  /**
   * @method getDelegations
   * @description Fetches the staking delegations associated with a specific blockchain address.
   * @param {Address} address - The blockchain address for which to retrieve delegation information.
   * 'Address' type is expected to be defined elsewhere (e.g., a string representing a wallet address).
   * @returns {Promise<Delegations>} A promise that resolves to an object containing delegation details.
   * 'Delegations' type is expected to be defined elsewhere, outlining the structure of delegation data.
   */
  getDelegations(address: Address): Promise<Delegations>;

  /**
   * @method getBalances
   * @description Retrieves an array of balances for a given blockchain address.
   * @param {Address} address - The blockchain address for which to fetch balances.
   * @returns {Promise<Balance[]>} A promise that resolves to an array of Balance objects.
   */
  getBalances(address: Address): Promise<Balance[]>;

  /**
   * @method getNonce
   * @description Fetches the current transaction nonce for a specific blockchain address.
   * The nonce is crucial for transaction ordering and preventing replay attacks.
   * @param {Address} address - The blockchain address for which to get the nonce.
   * @returns {Promise<number>} A promise that resolves to the current nonce value.
   */
  getNonce(address: Address): Promise<number>;

  /**
   * @method estimateFee
   * @description Estimates the transaction fee required for a given transaction.
   * This helps users understand the cost before committing to a transaction.
   * @param {Transaction} transaction - The transaction object for which to estimate the fee.
   * 'Transaction' type is expected to be defined elsewhere, outlining transaction parameters.
   * @returns {Promise<Fee>} A promise that resolves to the estimated fee object.
   * 'Fee' type is expected to be defined elsewhere, detailing fee components.
   */
  estimateFee(transaction: Transaction): Promise<Fee>;

  /**
   * @method sign
   * @description Performs a cryptographic signature operation on data, typically for transactions.
   * It supports signing using either a private key or existing account details.
   * @param {SigningWithPrivateKey | SigningWithAccount} signingArgs - The arguments required for the signing process.
   * This can be details about a private key or an existing account.
   * @returns {Promise<Hex>} A promise that resolves to the signed data in hexadecimal format.
   */
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex>;

  /**
   * @method prehash
   * @description Computes an intermediate hash of transaction data before the final signing process.
   * This step is often part of a multi-stage signing flow.
   * @param {BaseSignArgs} preHasArgs - The base arguments used for computing the pre-hash.
   * @returns {Promise<PrehashResult>} A promise that resolves to the result of the pre-hashing operation.
   */
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;

  /**
   * @method compile
   * @description Compiles raw transaction or contract interaction data into a format suitable for blockchain submission.
   * @param {CompileArgs} compileArgs - The arguments necessary for the compilation process.
   * @returns {Promise<Hex>} A promise that resolves to the compiled data in hexadecimal format.
   */
  compile(compileArgs: CompileArgs): Promise<Hex>;

  /**
   * @method buildCallData
   * @description Constructs the raw call data and amount required for a blockchain transaction or contract interaction.
   * This prepares the payload that will be sent on-chain.
   * @param {Transaction} transaction - The transaction object from which to build the call data.
   * @returns {{ data: Hex; amount: bigint }} An object containing the hexadecimal call data and the transaction amount as a bigint.
   */
  buildCallData(
    transaction: Transaction
  ): {
    data: Hex;
    amount: bigint;
  };

  /**
   * @method getChainInfo
   * @description Retrieves information about the blockchain chain that this GuardianService instance is configured for.
   * @returns {GuardianChain} An object containing details about the chain (e.g., ID, symbol, explorer URL).
   */
  getChainInfo(): GuardianChain;
}
