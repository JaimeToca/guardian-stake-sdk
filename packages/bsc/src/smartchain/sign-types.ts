import { PrivateKeyAccount } from "viem";
import { BaseSignArgs, SigningWithPrivateKey } from "@guardian/sdk";

/**
 * @typedef {BaseSignArgs & { account: PrivateKeyAccount }} SigningWithAccount
 * @description BSC-specific signing type that accepts a viem `PrivateKeyAccount`.
 */
export type SigningWithAccount = BaseSignArgs & { account: PrivateKeyAccount };

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
