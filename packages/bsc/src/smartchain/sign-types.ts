import type { PrivateKeyAccount } from "viem";
import type { BaseSignArgs, SigningWithPrivateKey, SignServiceContract, Transaction } from "@guardian/sdk";

/** EVM calldata and native value for a staking transaction. */
export type CallData = {
  data: `0x${string}`;
  amount: bigint;
};

/** BSC-specific sign service contract — extends the chain-agnostic contract with EVM calldata building. */
export interface BscSignServiceContract extends SignServiceContract {
  buildCallData(transaction: Transaction): Promise<CallData>;
}

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
