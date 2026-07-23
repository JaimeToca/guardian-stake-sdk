/**
 * Vote account row from `getVoteAccounts` (current or delinquent).
 * Addresses are base58 strings for service-layer consumption.
 */
export interface VoteAccountInfo {
  votePubkey: string;
  nodePubkey: string;
  activatedStake: bigint;
  commission: number;
  epochVoteAccount: boolean;
  lastVote: bigint;
  rootSlot: bigint;
  /** `[epoch, credits, previousCredits]` tuples, newest epochs last as returned by the node. */
  epochCredits: ReadonlyArray<readonly [epoch: bigint, credits: bigint, previousCredits: bigint]>;
}

/**
 * One epoch row from the StakeHistory sysvar.
 * Distinct from `state/activation.StakeHistoryEntry` (amounts only) — includes `epoch`
 * so callers can build a history map without relying on array order alone.
 * Entries from `getStakeHistory` are ordered newest epoch first.
 */
export interface StakeHistoryEntry {
  epoch: bigint;
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
}

/** Account payload returned by `getMultipleAccounts` / GPA (when present). */
export interface SolanaAccountInfo {
  address: string;
  lamports: bigint;
  data: Uint8Array;
  owner: string;
}

/** Subset returned by the GPA staker filter (no owner — always stake program). */
export interface SolanaStakeProgramAccount {
  address: string;
  lamports: bigint;
  data: Uint8Array;
}

export interface LatestBlockhash {
  blockhash: string;
  lastValidBlockHeight: bigint;
}

export interface EpochInfo {
  epoch: bigint;
  slotIndex: bigint;
  slotsInEpoch: bigint;
  absoluteSlot: bigint;
}

export interface VoteAccountsResult {
  current: VoteAccountInfo[];
  delinquent: VoteAccountInfo[];
}
