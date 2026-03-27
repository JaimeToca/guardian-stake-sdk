import { PrivateKeyAccount } from "viem";
import { BaseSignArgs, SigningWithPrivateKey } from "@guardian/sdk";

/** BSC-specific signing args that accept a viem `PrivateKeyAccount` instead of a raw private key. */
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
