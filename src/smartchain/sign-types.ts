import { PrivateKeyAccount } from "viem";
import { BaseSignArgs, SigningWithPrivateKey } from "../common";

/**
 * @typedef {BaseSignArgs & { account: PrivateKeyAccount }} SigningWithAccount
 * @description BSC-specific signing type that accepts a viem `PrivateKeyAccount`.
 * Use this when you already have a viem account object (e.g., from `privateKeyToAccount`,
 * a hardware wallet adapter, or another viem-compatible signer).
 * For a chain-agnostic path, use `SigningWithPrivateKey` instead.
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
