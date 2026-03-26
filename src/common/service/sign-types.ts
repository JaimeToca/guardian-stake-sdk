import { HexString } from "../entity/types";
import { PrivateKey } from "../entity/private-key";
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
 * @typedef {BaseSignArgs & { privateKey: PrivateKey }} SigningWithPrivateKey
 * @description Extends `BaseSignArgs` to include a validated private key for signing.
 * This is the chain-agnostic signing path — any chain implementation can accept a private key.
 * @property {PrivateKey} privateKey - A validated `PrivateKey` instance.
 */
export type SigningWithPrivateKey = BaseSignArgs & { privateKey: PrivateKey };

/**
 * @typedef {object} CompileArgs
 * @description Represents the arguments required to compile a signed transaction into its final,
 * ready-to-broadcast hexadecimal format. This often includes the raw transaction details
 * along with the cryptographic signature components.
 * @property {BaseSignArgs} signArgs - The base arguments originally used for the signing process.
 * @property {HexString} r - The 'r' component of the ECDSA signature (hexadecimal).
 * @property {HexString} s - The 's' component of the ECDSA signature (hexadecimal).
 * @property {bigint} v - The 'v' component (recovery ID) of the ECDSA signature.
 */
export type CompileArgs = {
  signArgs: BaseSignArgs;
  r: HexString;
  s: HexString;
  v: bigint;
};

/**
 * @typedef {object} PrehashResult
 * @description Represents the result of a pre-hashing operation, typically performed before a final signature.
 * This might involve serialization of the transaction data into a format ready for hashing.
 * @property {HexString} serializedTransaction - The transaction data serialized into a hexadecimal string,
 * often used for external signing services (e.g., MPC servers).
 * @property {BaseSignArgs} signArgs - The original base signing arguments. This is included
 * because some compilation processes (like Viem's) might not accept already serialized data
 * and prefer the original, unserialized arguments.
 */
export type PrehashResult = {
  serializedTransaction: HexString; // used for MPC server
  signArgs: BaseSignArgs; // pass into compile as viem does not offer unserialized
};
