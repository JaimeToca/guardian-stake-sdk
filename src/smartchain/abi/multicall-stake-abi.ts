import { parseAbi } from "viem";

/**
 * Minimal ABI for interacting with the BNB credit staking contract.
 * Includes only the relevant read functions used in this context:
 * - `getPooledBNB(address)` returns total staked BNB and rewards for a delegator.
 * - `pendingUnbondRequest(address)` returns the number of pending unbonding requests.
 * https://bscscan.com/address/0x0000000000000000000000000000000000002003
 */
export const multicallStakeAbi = parseAbi([
  "function getPooledBNB(address) view returns (uint256)",
  "function pendingUnbondRequest(address) view returns (uint256)",
]);

/**
 * Address of the BNB StakeHubContract on BSC.
 * This is a special system contract used for staking interactions.
 */
export const STAKING_CONTRACT = "0x0000000000000000000000000000000000002002";
