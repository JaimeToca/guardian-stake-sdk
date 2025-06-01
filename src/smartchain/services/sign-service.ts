import { Hex, serializeTransaction, TransactionSerializable } from "viem";
import { Fee } from "./fee-types";
import { SignServiceContract } from "./sign-service-contract";
import {
  ClaimTransaction,
  DelegateTransaction,
  RedelegateTransaction,
  Transaction,
  TransactionType,
  UndelegateTransaction,
} from "./transaction-types";
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
    switch (transaction.type) {
      case TransactionType.Delegate:
        return this.buildDelegateTransaction(transaction, fee, nonce);
      case TransactionType.Redelegate:
        return this.buildRedelegateTransaction(transaction, fee, nonce);
      case TransactionType.Undelegate:
        return this.buildUndelegateTransaction(transaction, fee, nonce);
      case TransactionType.Claim:
        return this.buildClaimTransaction(transaction, fee, nonce);
      default:
        throw Error("Unsupported transaction type");
    }
  }

  private buildDelegateTransaction(
    transaction: DelegateTransaction,
    fee: Fee,
    nonce: number
  ): TransactionSerializable {
    const operatorAddress = transaction.validator.operatorAddress;
    const delegateData = encodeDelegate(operatorAddress);
    const amount = transaction.amount;

    return this.buildBaseTransaction(
      {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
      amount,
      delegateData
    );
  }

  private buildRedelegateTransaction(
    transaction: RedelegateTransaction,
    fee: Fee,
    nonce: number
  ): TransactionSerializable {
    const fromOperatorAddress = transaction.fromValidator.operatorAddress;
    const toOperatorAddress = transaction.toValidator.operatorAddress;
    const amount = transaction.amount;
    const redelegateData = encodeRedelegate(
      fromOperatorAddress,
      toOperatorAddress,
      amount
    );

    return this.buildBaseTransaction(
      {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
      0n,
      redelegateData
    );
  }

  private buildUndelegateTransaction(
    transaction: UndelegateTransaction,
    fee: Fee,
    nonce: number
  ): TransactionSerializable {
    const operatorAddress = transaction.validator.operatorAddress;
    const amount = transaction.amount;
    const undelegateData = encodeUndelegate(operatorAddress, amount);

    return this.buildBaseTransaction(
      {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
      0n,
      undelegateData
    );
  }

  private buildClaimTransaction(
    transaction: ClaimTransaction,
    fee: Fee,
    nonce: number
  ): TransactionSerializable {
    const operatorAddress = transaction.validator.operatorAddress;
    const delegationIndex = transaction.index;
    const claimData = encodeClaim(operatorAddress, delegationIndex);

    return this.buildBaseTransaction(
      {
        transaction: transaction,
        fee: fee,
        nonce: nonce,
      },
      0n,
      claimData
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
      to: transaction.to,
      value: amount,
      data,
      chainId: transaction.chain.id,
      gas: fee.gasLimit,
      gasPrice: fee.gasPrice,
      nonce: nonce,
    };
  }
}
