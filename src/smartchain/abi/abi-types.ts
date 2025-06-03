import { Address } from "viem";

export type DecodedValidators = Map<Address, Address>;

export type DecodedUnbondRequest = {
  shares: bigint;
  amount: bigint;
  unlockTime: bigint;
};

export type MulticallResult = {
  status: "success" | "failure";
  result?: bigint;
  error?: Error;
};
