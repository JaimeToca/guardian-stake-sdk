import { encodeFunctionCall } from "./abi-utils";
import { Address, Hex } from "viem";

/**
 * @notice Encodes function calls for interacting with the BNB staking contracts
 * This includes interactions with the StakeHubContract (0x0000000000000000000000000000000000002002)
 * and the StakeCreditContract per validator (0x0000000000000000000000000000000000002003) on the BSC network.
 * Typically used to fetch information related to validators, delegation and prepare transactions.
 */

/**
 * @returns all validators addresses associated: Operator and Credit.
 */
export function encodeGetValidatorsData(): Hex {
  return encodeFunctionCall(
    "getValidators(uint256,uint256)",
    [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    [0, 100]
  );
}

/**
 * @param amount bnb in ethers unit
 * @returns Amount of shares that corresponds to `_bnbAmount` protocol-controlled BNB
 */
export function encodeGetSharesByPooledBNBData(amount: bigint): Hex {
  return encodeFunctionCall(
    "getSharesByPooledBNB(uint256)",
    [{ name: "bnbAmount", type: "uint256" }],
    [amount]
  );
}

/**
 * @param delegator account address
 * @returns Total amount of BNB staked and reward of the delegator
 */
export function encodeGetPooledBNBData(delegator: Address): Hex {
  return encodeFunctionCall(
    "getPooledBNB(address)",
    [{ name: "accout", type: "address" }],
    [delegator]
  );
}

/**
 * @param delegator account address
 * @returns unbound request information by index
 */
export function encodeUnbondRequestData(delegator: Address, index: bigint): Hex {
  return encodeFunctionCall(
    "unbondRequest(address)",
    [
      { name: "delegator", type: "address" },
      { name: "_index", type: "uint256" },
    ],
    [delegator, index]
  );
}

/**
 * @param delegator account address
 * @returns total number of delegator's claimable unbond requests
 */
export function encodeClaimableUnbondRequestData(delegator: Address): Hex {
  return encodeFunctionCall(
    "claimableUnbondRequest(address)",
    [{ name: "delegator", type: "address" }],
    [delegator]
  );
}

export function encodePendingUnbondRequestData(delegator: Address): Hex {
  return encodeFunctionCall(
    "pendingUnbondRequest(address)",
    [{ name: "delegator", type: "address" }],
    [delegator]
  );
}
