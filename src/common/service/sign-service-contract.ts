import { Hex } from "viem";
import {
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
} from "./sign-types";
import { Transaction } from "./transaction-types";

/**
 * @interface SignServiceContract
 * @description Defines the contract for a service dedicated to cryptographic signing operations
 * and related transaction preparation functionalities. This interface standardizes how
 * transactions are signed, pre-hashed, compiled, and how call data is built.
 */
export interface SignServiceContract {
  /**
   * @method sign
   * @description Performs a cryptographic signature operation on transaction data.
   * This method supports signing using either a direct private key or an account abstraction.
   * @param {SigningWithPrivateKey | SigningWithAccount} signingArgs - The arguments required for the signing process,
   * encapsulating either a private key or an account object along with transaction details.
   * @returns {Promise<Hex>} A promise that resolves to the completed cryptographic signature in hexadecimal format.
   */
  sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex>;

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
   * @returns {Promise<Hex>} A promise that resolves to the fully compiled and RLP-encoded transaction
   * in hexadecimal format, ready for submission to a node.
   */
  compile(compileArgs: CompileArgs): Promise<Hex>;

  /**
   * @method buildCallData
   * @description Constructs the hexadecimal call data and the associated amount for a given transaction.
   * This data is typically used when interacting with smart contracts or sending value.
   * @param {Transaction} transaction - The transaction object from which to extract or construct
   * the necessary call data and value.
   * @returns {{ data: Hex; amount: bigint; }} An object containing:
   * - `data`: The hexadecimal string representing the function call data or message.
   * - `amount`: The amount of native currency (e.g., Ether, BNB) to be sent with the transaction, as a `bigint`.
   */
  buildCallData(
    transaction: Transaction
  ): {
    data: Hex;
    amount: bigint;
  };
}
