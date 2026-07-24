import type { PrivateKeyAccount } from "viem";
import type {
  BaseSignArgs,
  SigningWithPrivateKey,
  SignServiceContract,
  Transaction,
} from "@guardian-sdk/sdk";

/** EVM calldata and native value for a staking transaction. */
export interface CallData {
  data: `0x${string}`;
  amount: bigint;
}

/** BSC-specific sign service contract — extends the chain-agnostic contract with EVM calldata building. */
export interface BscSignServiceContract extends SignServiceContract {
  buildCallData(transaction: Transaction): Promise<CallData>;
}

/**
 * Sign args carrying the exact serialized unsigned tx through prehash -> compile
 * (mirrors Cardano's `_txBodyCbor` and Tron's `_rawTx`).
 *
 * `compile()` reuses `_unsignedTx` verbatim instead of rebuilding the transaction from
 * `signArgs.transaction`/`signArgs.fee` — this guarantees the bytes an external signer
 * signed are exactly the bytes that get assembled and broadcast, and avoids re-running
 * `bnbToShares()`/live RPC a second time for Undelegate/Redelegate.
 */
export interface BscSignArgs extends BaseSignArgs {
  /** @internal Populated by `prehash()` and forwarded through `PrehashResult.signArgs`. */
  _unsignedTx?: `0x${string}`;
}

/** BSC-specific signing args that accept a viem `PrivateKeyAccount` instead of a raw private key. */
export interface SigningWithAccount extends BaseSignArgs {
  account: PrivateKeyAccount;
}

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
