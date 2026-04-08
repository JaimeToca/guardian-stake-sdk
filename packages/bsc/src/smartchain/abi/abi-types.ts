import type { Address } from "viem";

export type DecodedValidators = Map<Address, Address>;

export interface DecodedUnbondRequest {
  shares: bigint;
  amount: bigint;
  unlockTime: bigint;
}

export interface MulticallResult {
  status: "success" | "failure";
  result?: bigint;
  error?: Error;
}
