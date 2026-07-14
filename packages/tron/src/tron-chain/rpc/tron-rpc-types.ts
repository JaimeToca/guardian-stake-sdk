export type TronResource = "ENERGY" | "BANDWIDTH";

export interface TronAccount {
  balance: bigint;
  frozen: { resource: TronResource; amount: bigint }[];
  unfreezing: { amount: bigint; expireTime: number }[];
  votes: { srAddress: string; votes: bigint }[];
}

export interface TronWitness {
  address: string;
  voteCount: bigint;
  url: string;
  isSr: boolean;
}

/**
 * Raw bandwidth limits/usage from `getaccountresource`, in bandwidth points. The RPC client
 * maps the response verbatim; deriving "available bandwidth" (`limit − used`, floored at 0)
 * is left to the consumer (see `fee-service`).
 */
export interface TronAccountResources {
  freeNetLimit: bigint;
  freeNetUsed: bigint;
  netLimit: bigint;
  netUsed: bigint;
}

// --- Raw FullNode API response shapes (used with fetchOrError) ---

export interface TronGetAccountResponse {
  balance?: bigint | number;
  frozenV2?: { type?: string; amount?: bigint | number }[];
  unfrozenV2?: {
    unfreeze_amount?: bigint | number;
    unfreeze_expire_time?: bigint | number;
  }[];
  votes?: { vote_address: string; vote_count: bigint | number }[];
}

export interface TronGetAccountResourceResponse {
  freeNetLimit?: bigint | number;
  freeNetUsed?: bigint | number;
  NetLimit?: bigint | number;
  NetUsed?: bigint | number;
}

export interface TronGetRewardResponse {
  reward?: bigint | number;
}

export interface TronListWitnessesResponse {
  witnesses?: {
    address: string;
    voteCount?: bigint | number;
    url?: string;
    isJobs?: boolean;
  }[];
}

export interface TronGetChainParametersResponse {
  chainParameter?: { key: string; value?: bigint | number }[];
}

export interface TronGetBrokerageResponse {
  brokerage?: bigint | number;
}

export interface TronBroadcastResponse {
  result?: boolean;
  txid?: string;
  code?: string;
  message?: string;
}
