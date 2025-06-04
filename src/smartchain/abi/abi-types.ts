import { Address } from "viem";

/**
 * Represents a decoded list of validators from a contract call.
 * The key is the operator address, and the value is the credit address.
 * 
 * Example:
 * Map {
 *   "0xValidatorAddress1" => "0xCreditAddress1",
 *   "0xValidatorAddress2" => "0xCreditAddress2",
 * }
 */
export type DecodedValidators = Map<Address, Address>;

/**
 * Represents an individual unbonding request for a delegator.
 */
export type DecodedUnbondRequest = {
  shares: bigint;
  amount: bigint;
  unlockTime: bigint;
};

/**
 * Represents the result of a single call in a multicall context.
 */
export type MulticallResult = {
  status: "success" | "failure";
  result?: bigint;
  error?: Error;
};
