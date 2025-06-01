import { Hex, Account, serializeTransaction } from "viem";
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

export class SignService implements SignServiceContract {
  sign(
    transaction: Transaction,
    fee: Fee,
    nonce: number,
    privateKey: Hex
  ): Hex {
    return "0x";
  }

  private buildUnsignedTransaction(
    transaction: Transaction,
    fee: Fee,
    nonce: number
  ): string {
    switch (transaction.type) {
      case TransactionType.Delegate:
        return this.buildDelegateTransaction(transaction, fee, nonce);
      case TransactionType.Redelegate:
        return this.buildRedelegateTransaction(transaction, fee, nonce);
      case TransactionType.Undelegate:
        return this.buildUndelegateTransaction(transaction, fee, nonce);
      case TransactionType.Claim:
        return this.buildClaimTransaction(transaction, fee, nonce);
    }
    return "";
  }

  private buildDelegateTransaction(
    transaction: DelegateTransaction,
    fee: Fee,
    nonce: number
  ): string {
    const unsignedTransaction = {
      to: transaction.to,
      value: 0n,
      data,
      chainId: transaction.chain.id,
      gas: fee.gasLimit,
      gasPrice: fee.gasPrice,
      nonce: nonce,
    };
    serializeTransaction(unsignedTransaction)
    return unsignedTransaction;
  }

  private buildRedelegateTransaction(
    transaction: RedelegateTransaction,
    fee: Fee,
    nonce: number
  ): string {
    return "";
  }

  private buildUndelegateTransaction(
    transaction: UndelegateTransaction,
    fee: Fee,
    nonce: number
  ): string {
    return "";
  }

  private buildClaimTransaction(
    transaction: ClaimTransaction,
    fee: Fee,
    nonce: number
  ): string {
    return "";
  }

  private buildBaseTransaction() {

  }
}
