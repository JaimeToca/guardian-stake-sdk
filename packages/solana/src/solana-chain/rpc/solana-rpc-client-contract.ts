import type {
  EpochInfo,
  InflationRate,
  LatestBlockhash,
  SolanaAccountInfo,
  SolanaClock,
  SolanaStakeProgramAccount,
  StakeHistoryEntry,
  Supply,
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
  /** Clock sysvar — epoch + wall-clock unix timestamp (for lockup checks). */
  getClock(): Promise<SolanaClock>;
  /** Current epoch from the Clock sysvar. */
  getClockEpoch(): Promise<bigint>;
  /** Current-epoch inflation rates (annual fractions). */
  getInflationRate(): Promise<InflationRate>;
  /** Circulating / total supply in lamports (non-circulating account list excluded). */
  getSupply(): Promise<Supply>;
}
