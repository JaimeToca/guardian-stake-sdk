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
