import { Hex, PrivateKeyAccount } from "viem";
import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";

/**
 * @typedef {object} BaseSignArgs
 * @description Represents the common arguments required for any signing operation.
 * These arguments provide the fundamental data needed before a transaction can be signed.
 * @property {Transaction} transaction - The transaction object to be signed.
 * @property {Fee} fee - The fee associated with the transaction, including gas price, limit, etc.
 * @property {number} nonce - The transaction nonce, ensuring unique transaction ordering from an address.
 */
export type BaseSignArgs = {
  transaction: Transaction;
  fee: Fee;
  nonce: number;
};

/**
 * @typedef {BaseSignArgs & { privateKey: Hex }} SigningWithPrivateKey
 * @description Extends `BaseSignArgs` to include a private key for signing.
 * This type is used when the signing operation requires direct access to the private key.
 * @property {Hex} privateKey - The private key (in hexadecimal format) used for signing the transaction.
 */
export type SigningWithPrivateKey = BaseSignArgs & { privateKey: Hex };

/**
 * @typedef {BaseSignArgs & { account: PrivateKeyAccount }} SigningWithAccount
 * @description Extends `BaseSignArgs` to include a Viem `PrivateKeyAccount` for signing.
 * This type is used when the signing operation is handled by an account object, often abstracting the private key.
 * @property {PrivateKeyAccount} account - The Viem `PrivateKeyAccount` object used for signing.
 */
export type SigningWithAccount = BaseSignArgs & { account: PrivateKeyAccount };

/**
 * @typedef {object} CompileArgs
 * @description Represents the arguments required to compile a signed transaction into its final,
 * ready-to-broadcast hexadecimal format. This often includes the raw transaction details
 * along with the cryptographic signature components.
 * @property {BaseSignArgs} signArgs - The base arguments originally used for the signing process.
 * @property {Hex} r - The 'r' component of the ECDSA signature (hexadecimal).
 * @property {Hex} s - The 's' component of the ECDSA signature (hexadecimal).
 * @property {bigint} v - The 'v' component (recovery ID) of the ECDSA signature.
 */
export type CompileArgs = {
  signArgs: BaseSignArgs;
  r: Hex;
  s: Hex;
  v: bigint;
};

/**
 * @function isSigningWithPrivateKey
 * @description Type guard function to determine if a given `signingArgs` object is of type `SigningWithPrivateKey`.
 * This allows for type-safe handling of different signing argument types.
 * @param {SigningWithPrivateKey | SigningWithAccount} args - The arguments to check.
 * @returns {args is SigningWithPrivateKey} `true` if `args` contains a `privateKey` property, 
 * indicating it's a `SigningWithPrivateKey` type; otherwise, `false`.
 */
export function isSigningWithPrivateKey(
  args: SigningWithPrivateKey | SigningWithAccount
): args is SigningWithPrivateKey {
  return "privateKey" in args;
}

/**
 * @function isSigningWithAccount
 * @description Type guard function to determine if a given `signingArgs` object is of type `SigningWithAccount`.
 * This allows for type-safe handling of different signing argument types.
 * @param {SigningWithPrivateKey | SigningWithAccount} args - The arguments to check.
 * @returns {args is SigningWithAccount} `true` if `args` contains an `account` property, indicating 
 * it's a `SigningWithAccount` type; otherwise, `false`.
 */
export function isSigningWithAccount(
  args: SigningWithPrivateKey | SigningWithAccount
): args is SigningWithAccount {
  return "account" in args;
}

/**
 * @typedef {object} PrehashResult
 * @description Represents the result of a pre-hashing operation, typically performed before a final signature.
 * This might involve serialization of the transaction data into a format ready for hashing.
 * @property {Hex} serializedTransaction - The transaction data serialized into a hexadecimal string,
 * often used for external signing services (e.g., MPC servers).
 * @property {BaseSignArgs} signArgs - The original base signing arguments. This is included
 * because some compilation processes (like Viem's) might not accept already serialized data
 * and prefer the original, unserialized arguments.
 */
export type PrehashResult = {
  serializedTransaction: Hex; // used for MPC server
  signArgs: BaseSignArgs; // pass into compile as viem does not offer unserialized
};
