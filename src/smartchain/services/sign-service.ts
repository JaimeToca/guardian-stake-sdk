import {
  Address,
  Hex,
  serializeTransaction,
  TransactionSerializable,
} from "viem";
import {
  encodeClaim,
  encodeDelegate,
  encodeRedelegate,
  encodeUndelegate,
} from "../abi/staking-function-enconder";
import { privateKeyToAccount } from "viem/accounts";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import {
  SignServiceContract,
  Fee,
  TransactionType,
  Validator,
  OperatorAddress,
  BaseSignArgs,
  CompileArgs,
  isSigningWithAccount,
  isSigningWithPrivateKey,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
  Transaction,
} from "../../common";

/**
 * Service responsible for handling various aspects of transaction signing,
 * including building unsigned transactions, signing them with private keys or account objects,
 * pre-hashing transactions for external signing, and compiling signed transactions from raw signature components.
 */
export class SignService implements SignServiceContract {
  /**
   * Signs a transaction using either a provided private key or an existing viem Account object.
   *
   * @param signingArgs An object containing the transaction details, fee, nonce, and either
   * a private key (`SigningWithPrivateKey`) or an Account object (`SigningWithAccount`).
   * @returns A Promise that resolves to the RLP-encoded, signed transaction as a hexadecimal string.
   * @throws Error if the provided `signingArgs` are invalid.
   */
  async sign(
    signingArgs: SigningWithPrivateKey | SigningWithAccount
  ): Promise<Hex> {
    const fee = signingArgs.fee;
    const nonce = signingArgs.nonce;
    const transaction = signingArgs.transaction;

    const unsignedTransaction = this.buildUnsignedTransaction(
      transaction,
      fee,
      nonce
    );

    let signedTransaction: Hex;

    if (isSigningWithAccount(signingArgs)) {
      const account = signingArgs.account;
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else if (isSigningWithPrivateKey(signingArgs)) {
      const privateKey = signingArgs.privateKey;
      const account = privateKeyToAccount(privateKey);
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else {
      throw Error("Invalid Arguments for signing");
    }

    return signedTransaction;
  }

  /**
   * Pre-hashes a transaction, returning the serialized unsigned transaction and the original signing arguments.
   * This is useful for scenarios where the transaction needs to be signed externally (e.g., by a hardware wallet)
   * and only the hash is required for signing.
   *
   * @param preHasArgs An object containing the transaction details, fee, and nonce.
   * @returns A Promise that resolves to a `PrehashResult` object, containing the serialized unsigned transaction
   * and the original `BaseSignArgs`.
   */
  async prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    const transaction = preHasArgs.transaction;
    const fee = preHasArgs.fee;
    const nonce = preHasArgs.nonce;

    const unsignedTransaction = this.buildUnsignedTransaction(
      transaction,
      fee,
      nonce
    );

    return {
      serializedTransaction: serializeTransaction(unsignedTransaction),
      signArgs: {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
    };
  }

  /**
   * Compiles a fully signed transaction from an unsigned transaction and its ECDSA signature components (r, s, v).
   * This is used when a signature has been generated externally (e.g., by a hardware wallet or an MPC service)
   * and needs to be assembled into a complete, RLP-encoded transaction ready for broadcast.
   *
   * @param compileArgs An object containing the base signing arguments (transaction, fee, nonce)
   * and the ECDSA signature components (r, s, v).
   * @returns A Promise that resolves to the RLP-encoded, signed transaction as a hexadecimal string.
   */
  async compile(compileArgs: CompileArgs): Promise<Hex> {
    const transaction = compileArgs.signArgs.transaction;
    const fee = compileArgs.signArgs.fee;
    const nonce = compileArgs.signArgs.nonce;
    const r = compileArgs.r;
    const s = compileArgs.s;
    const v = compileArgs.v;

    const unsignedTransaction = this.buildUnsignedTransaction(
      transaction,
      fee,
      nonce
    );

    return serializeTransaction(unsignedTransaction, { r, s, v });
  }

  /**
   * Builds a `TransactionSerializable` object (an unsigned transaction) from the given transaction details,
   * fee, and nonce. This internal helper function is used by `sign`, `prehash`, and `compile`.
   *
   * @param transaction The specific transaction details (e.g., delegate, redelegate).
   * @param fee The gas limit and gas price for the transaction.
   * @param nonce The nonce (transaction count) of the sending address.
   * @returns A `TransactionSerializable` object representing the unsigned transaction.
   */
  private buildUnsignedTransaction(
    transaction: Transaction,
    fee: Fee,
    nonce: number
  ): TransactionSerializable {
    const { data, amount } = this.buildCallData(transaction);

    return this.buildBaseTransaction(
      {
        transaction,
        fee,
        nonce,
      },
      amount,
      data
    );
  }

  /**
   * Builds a base `TransactionSerializable` object, common to all transaction types.
   * It sets the recipient to the staking contract, the value, data, chain ID, gas, gas price, and nonce.
   *
   * @param signArgs The base signing arguments containing transaction, fee, and nonce.
   * @param amount The value (in Wei) to be sent with the transaction.
   * @param data The calldata for the transaction, encoded for the specific staking operation.
   * @returns A `TransactionSerializable` object.
   */
  private buildBaseTransaction(
    signArgs: BaseSignArgs,
    amount: bigint,
    data: Hex
  ): TransactionSerializable {
    const transaction = signArgs.transaction;
    const fee = signArgs.fee;
    const nonce = signArgs.nonce;

    return {
      to: STAKING_CONTRACT,
      value: amount,
      data,
      chainId: Number(transaction.chain.chainId),
      gas: fee.gasLimit,
      gasPrice: fee.gasPrice,
      nonce: nonce,
    };
  }

  /**
   * Builds the specific `data` (calldata) and `amount` for a transaction based on its `TransactionType`.
   * This involves encoding the function call for staking operations like delegate, redelegate, undelegate, and claim.
   *
   * @param transaction The transaction object containing type-specific details.
   * @returns An object containing the hexadecimal calldata (`data`) and the `amount` (value) to send.
   * @throws Error if an unsupported transaction type is encountered.
   */
  buildCallData(transaction: Transaction): {
    data: Hex;
    amount: bigint;
  } {
    switch (transaction.type) {
      case TransactionType.Delegate: {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        return {
          data: encodeDelegate(operatorAddress),
          amount: transaction.amount,
        };
      }
      case TransactionType.Redelegate: {
        const from = this.getValidatorAddress(transaction.fromValidator);
        const to = this.getValidatorAddress(transaction.toValidator);
        return {
          data: encodeRedelegate(from, to, transaction.amount),
          amount: 0n,
        };
      }
      case TransactionType.Undelegate: {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        return {
          data: encodeUndelegate(operatorAddress, transaction.amount),
          amount: 0n,
        };
      }
      case TransactionType.Claim: {
        const operatorAddress = this.getValidatorAddress(transaction.validator);
        return {
          data: encodeClaim(operatorAddress, transaction.index),
          amount: 0n,
        };
      }
      default:
        throw new Error(
          "Cannot build call data due to unsupported transaction type"
        );
    }
  }

  /**
   * Extracts the blockchain address of a validator, whether it's provided directly as an `Address`
   * or as a `Validator` object.
   *
   * @param validator The validator input, which can be an `Address` string or a `Validator` object.
   * @returns The blockchain address (of type `Address`) of the validator.
   */
  private getValidatorAddress(validator: Validator | OperatorAddress): Address {
    if (typeof validator === "string") {
      return validator;
    } else {
      return validator.operatorAddress;
    }
  }
}
