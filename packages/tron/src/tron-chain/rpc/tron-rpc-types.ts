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
