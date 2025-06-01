import { Account, Hex } from "viem";
import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";

export interface SignServiceContract {
    sign(transaction: Transaction, fee: Fee, nonce: number, privateKey: Hex): Hex
    //sign(transaction: Transaction, fee: Fee, nonce: bigint, account: Account): Hex
    //prehash(transaction: Transaction, fee: Fee, nonce: bigint): Hex
    //compile(fullSignature: Hex, unsignedTransaction: Hex): Hex
    //compile(r: Hex, s: Hex, v: Hex, unsignedTransaction: Hex): Hex
}