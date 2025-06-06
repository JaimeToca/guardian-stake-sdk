import { Address, Hex, serializeTransaction, TransactionSerializable } from "viem";
import { Fee } from "./fee-types";
import { SignServiceContract } from "./sign-service-contract";
import { OperatorAddress, Transaction, TransactionType } from "./transaction-types";
import {
  SigningWithPrivateKey,
  SigningWithAccount,
  BaseSignArgs,
  CompileArgs,
  PrehashResult,
  isSigningWithAccount,
  isSigningWithPrivateKey,
} from "./sign-types";
import {
  encodeClaim,
  encodeDelegate,
  encodeRedelegate,
  encodeUndelegate,
} from "../abi/staking-function-enconder";
import { privateKeyToAccount } from "viem/accounts";
import { STAKING_CONTRACT } from "../abi/multicall-stake-abi";
import { Validator } from "./staking-types";

export class SignService implements SignServiceContract {
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

  prehash(preHasArgs: BaseSignArgs): PrehashResult {
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

  compile(compileArgs: CompileArgs): Hex {
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

    return serializeTransaction({ unsignedTransaction, r, s, v });
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
      chainId: transaction.chain.id,
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
        const operatorAddress = this.getValidatorAddress(transaction.validator)
        return {
          data: encodeDelegate(operatorAddress),
          amount: transaction.amount,
        };
      }
      case TransactionType.Redelegate: {
        const from = this.getValidatorAddress(transaction.fromValidator)
        const to = this.getValidatorAddress(transaction.toValidator)
        return {
          data: encodeRedelegate(from, to, transaction.amount),
          amount: 0n,
        };
      }
      case TransactionType.Undelegate: {
        const operatorAddress = this.getValidatorAddress(transaction.validator)
        return {
          data: encodeUndelegate(operatorAddress, transaction.amount),
          amount: 0n,
        };
      }
      case TransactionType.Claim: {
        const operatorAddress = this.getValidatorAddress(transaction.validator)
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

  getValidatorAddress(validator: Validator | OperatorAddress): Address {
    if (typeof validator === 'string') {
      return validator
    } else {
      return validator.operatorAddress
    }
  }
}
