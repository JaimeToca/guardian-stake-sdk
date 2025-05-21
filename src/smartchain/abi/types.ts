import { Address } from "viem";

export type DecodedValidators = Map<Address, Address>

export type MulticallResult = {
  status: "success" | "failure";
  result?: bigint;
  error?: Error;
};