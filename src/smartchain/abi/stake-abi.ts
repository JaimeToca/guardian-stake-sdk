import { parseAbi } from "viem";

// Credit Contract: https://bscscan.com/address/0x0000000000000000000000000000000000002003
export const multicallStakeAbi = parseAbi([
  "function getPooledBNB(address) view returns (uint256)",
  "function pendingUnbondRequest(address) view returns (uint256)",
]);

export const STAKING_CONTRACT = "0x0000000000000000000000000000000000002002";
