import { HexString } from "../entity/types";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
} from "./sign-types";
import { Transaction } from "./transaction-types";

/**
 * @interface SignServiceContract
 * @description Defines the chain-agnostic contract for cryptographic signing operations.
 * Chain-specific implementations (e.g., BSC, TRON) may extend this contract to support
 * additional signer types (e.g., viem accounts, TronWeb accounts).
 */
export interface SignServiceContract {
  /**
   * @method sign
   * @description Signs a transaction using a raw private key.
   * @param {SigningWithPrivateKey} signingArgs - The transaction details and private key.
   * @returns {Promise<string>} A promise that resolves to the signed transaction as a hex string.
   */
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;

  /**
   * @method prehash
   * @description Computes an intermediate hash of transaction data prior to the final signing step.
   * This is often used in multi-party computation (MPC) or specific signing workflows
   * where the raw transaction needs to be prepared for hashing by a separate entity.
   * @param {BaseSignArgs} preHasArgs - The base arguments of the transaction needed for the pre-hashing process.
   * @returns {Promise<PrehashResult>} A promise that resolves to an object containing the serialized transaction
   * (ready for hashing) and potentially the original signing arguments.
   */
  prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult>;

  /**
   * @method compile
   * @description Compiles the signed transaction data (including the signature components)
   * into a final, deployable hexadecimal string that can be broadcast to the blockchain.
   * @param {CompileArgs} compileArgs - The arguments required for compilation, which typically include
   * the original transaction details and the `r`, `s`, and `v` components of the signature.
   * @returns {Promise<string>} A promise that resolves to the fully compiled transaction
   * in hexadecimal format, ready for submission to a node.
   */
  compile(compileArgs: CompileArgs): Promise<string>;

  /**
   * @method buildCallData
   * @description Constructs the hexadecimal call data and the associated amount for a given transaction.
   * @param {Transaction} transaction - The transaction object from which to construct the call data.
   * @returns {{ data: HexString; amount: bigint; }} An object containing the call data and value.
   */
  buildCallData(
    transaction: Transaction
  ): {
    data: HexString;
    amount: bigint;
  };
}
