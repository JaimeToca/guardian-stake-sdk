import { Hex, PrivateKeyAccount } from "viem";
import { Fee } from "./fee-types";
import { Transaction } from "./transaction-types";

export type BaseSignArgs = {
  transaction: Transaction;
  fee: Fee;
  nonce: number;
};

export type SigningWithPrivateKey = BaseSignArgs & { privateKey: Hex };
export type SigningWithAccount = BaseSignArgs & { account: PrivateKeyAccount };

export type CompileArgs = {
  signArgs: BaseSignArgs;
  r: Hex;
  s: Hex;
  v: bigint;
};

export function isSigningWithPrivateKey(
  args: SigningWithPrivateKey | SigningWithAccount
): args is SigningWithPrivateKey {
  return "privateKey" in args;
}

export function isSigningWithAccount(
  args: SigningWithPrivateKey | SigningWithAccount
): args is SigningWithAccount {
  return "account" in args;
}

export type PrehashResult = {
  serializedTransaction: Hex; // used for MPC server
  signArgs: BaseSignArgs; // pass into compile as viem does not offer unserialized
};
