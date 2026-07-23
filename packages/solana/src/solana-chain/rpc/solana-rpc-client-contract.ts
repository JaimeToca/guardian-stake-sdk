import type {
  EpochInfo,
  LatestBlockhash,
  SolanaAccountInfo,
  SolanaStakeProgramAccount,
  StakeHistoryEntry,
  VoteAccountsResult,
} from "./solana-rpc-types";

export interface SolanaRpcClientContract {
  getBalance(address: string): Promise<bigint>;
  getLatestBlockhash(): Promise<LatestBlockhash>;
  getEpochInfo(): Promise<EpochInfo>;
  getVoteAccounts(): Promise<VoteAccountsResult>;
  getMultipleAccounts(addresses: string[]): Promise<Array<SolanaAccountInfo | null>>;
  getMinimumBalanceForRentExemption(space: number): Promise<bigint>;
  getStakeMinimumDelegation(): Promise<bigint>;
  getFeeForMessage(messageBase64: string): Promise<bigint | null>;
  /** Optional heavy path — only called when `enableGpaFallback` is set. */
  getProgramAccountsStakeByStaker(staker: string): Promise<SolanaStakeProgramAccount[]>;
  /** Submit a base64 wire transaction; returns the transaction signature (base58). */
  sendTransaction(wireTransactionBase64: string): Promise<string>;
  /** StakeHistory sysvar rows, newest epoch first. */
  getStakeHistory(): Promise<StakeHistoryEntry[]>;
  /** Current epoch from the Clock sysvar. */
  getClockEpoch(): Promise<bigint>;
}
