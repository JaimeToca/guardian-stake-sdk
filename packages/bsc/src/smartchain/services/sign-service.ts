import type { Address, Hex, TransactionSerializable } from "viem";
import { serializeTransaction } from "viem";
import {
  encodeClaim,
  encodeDelegate,
  encodeRedelegate,
  encodeUndelegate,
} from "../abi/staking-function-enconder";
import { privateKeyToAccount } from "viem/accounts";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import type {
  SignServiceContract,
  Fee,
  Validator,
  OperatorAddress,
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  SigningWithPrivateKey,
  Transaction,
} from "@guardian/sdk";
import { SigningError, SigningErrorCode, TransactionType } from "@guardian/sdk";
import type { SigningWithAccount } from "../sign-types";
import { isSigningWithAccount, isSigningWithPrivateKey } from "../sign-types";
import { parseEvmAddress } from "../validations";

/**
 * Service responsible for handling various aspects of transaction signing on BSC.
 */
export class SignService implements SignServiceContract {
  async sign(signingArgs: SigningWithPrivateKey | SigningWithAccount): Promise<Hex> {
    const fee = signingArgs.fee;
    const nonce = signingArgs.nonce;
    const transaction = signingArgs.transaction;

    const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);

    let signedTransaction: Hex;

    if (isSigningWithAccount(signingArgs)) {
      const account = signingArgs.account;
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else if (isSigningWithPrivateKey(signingArgs)) {
      const account = privateKeyToAccount(signingArgs.privateKey.toHex());
      signedTransaction = await account.signTransaction(unsignedTransaction);
    } else {
      throw new SigningError(
        SigningErrorCode.INVALID_SIGNING_ARGS,
        "signingArgs must contain either a privateKey (SigningWithPrivateKey) or an account (SigningWithAccount)."
      );
    }

    return signedTransaction;
  }

  async prehash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    const transaction = preHasArgs.transaction;
    const fee = preHasArgs.fee;
    const nonce = preHasArgs.nonce;

    const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);

    return {
      serializedTransaction: serializeTransaction(unsignedTransaction),
      signArgs: {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
    };
  }

  async compile(compileArgs: CompileArgs): Promise<Hex> {
    const transaction = compileArgs.signArgs.transaction;
    const fee = compileArgs.signArgs.fee;
    const nonce = compileArgs.signArgs.nonce;
    const r = compileArgs.r;
    const s = compileArgs.s;
    const v = compileArgs.v;

    const unsignedTransaction = this.buildUnsignedTransaction(transaction, fee, nonce);

    return serializeTransaction(unsignedTransaction, { r, s, v });
  }

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
        throw new SigningError(
          SigningErrorCode.UNSUPPORTED_TRANSACTION_TYPE,
          `Cannot build call data: unsupported transaction type "${(transaction as Transaction).type}".`
        );
    }
  }

  private getValidatorAddress(validator: Validator | OperatorAddress): Address {
    if (typeof validator === "string") {
      return parseEvmAddress(validator);
    } else {
      return parseEvmAddress(validator.operatorAddress);
    }
  }
}
