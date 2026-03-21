import { encodeFunctionCall } from "./abi-utils";
import { Address, Hex } from "viem";

/**
 * @notice Encodes function calls for interacting with the BNB staking contracts
 * This includes interactions with the StakeHubContract (0x0000000000000000000000000000000000002002)
 * and the StakeCreditContract per validator (0x0000000000000000000000000000000000002003) on the BSC network.
 * Typically used to fetch information related to validators, delegation and prepare transactions.
 */

/**
 * Encodes a call to fetch validator addresses.
 * 
 * @returns Encoded data to call `getValidators(uint256,uint256)` with an offset of 0 and a limit of 100.
 * The result includes all validator operator and credit addresses.
 * Note: At the moment BSC only has 50 validators 3 Jun 2025
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
 * Encodes a call to compute how many shares correspond to a given BNB amount.
 * 
 * @param amount - Amount of BNB in **wei** (not ether units).
 * @returns Encoded data for `getSharesByPooledBNB(uint256)` which returns the amount of shares 
 * corresponding to protocol-controlled BNB.
 */
export function encodeGetSharesByPooledBNBData(amount: bigint): Hex {
  return encodeFunctionCall(
    "getSharesByPooledBNB(uint256)",
    [{ name: "bnbAmount", type: "uint256" }],
    [amount]
  );
}

/**
 * Encodes a call to get the total staked BNB and rewards for a specific delegator.
 * 
 * @param delegator - Address of the delegator account.
 * @returns Encoded data for `getPooledBNB(address)`, which returns the total BNB and rewards for the delegator.
 */
export function encodeGetPooledBNBData(delegator: Address): Hex {
  return encodeFunctionCall(
    "getPooledBNB(address)",
    [{ name: "account", type: "address" }],
    [delegator]
  );
}

/**
 * Encodes a call to fetch details of a specific unbonding request.
 * 
 * @param delegator - Address of the delegator.
 * @param index - Index of the unbonding request in the queue.
 * @returns Encoded data for `unbondRequest(address,uint256)`, which returns request info at the given index.
 */
export function encodeUnbondRequestData(
  delegator: Address,
  index: bigint
): Hex {
  return encodeFunctionCall(
    "unbondRequest(address,uint256)",
    [
      { name: "delegator", type: "address" },
      { name: "_index", type: "uint256" },
    ],
    [delegator, index]
  );
}

/**
 * Encodes a call to get the number of pending unbonding requests in the delegator's queue.
 * 
 * @param delegator - Address of the delegator.
 * @returns Encoded data for `pendingUnbondRequest(address)`, returning the total pending unbonding requests.
 */
export function encodePendingUnbondRequestData(delegator: Address): Hex {
  return encodeFunctionCall(
    "pendingUnbondRequest(address)",
    [{ name: "delegator", type: "address" }],
    [delegator]
  );
}

/**
 * Encodes a `delegate` function call for staking.
 *
 * @param operatorAddress - The address of the validator/operator to delegate to.
 * @returns Encoded hex string representing the `delegate(address,bool)` call with `delegateVotePower` set to false.
 */
export function encodeDelegate(operatorAddress: Address): Hex {
  return encodeFunctionCall(
    "delegate(address,bool)",
    [
      { name: "operatorAddress", type: "address" },
      { name: "delegateVotePower", type: "bool" },
    ],
    [operatorAddress, false]
  );
}

/**
 * Encodes an `undelegate` function call to withdraw stake from a validator.
 *
 * @param operatorAddress - The address of the validator/operator to undelegate from.
 * @param shares - The number of shares (stake amount) to undelegate.
 * @returns Encoded hex string representing the `undelegate(address,uint256)` call.
 */
export function encodeUndelegate(
  operatorAddress: Address,
  shares: bigint
): Hex {
  return encodeFunctionCall(
    "undelegate(address,uint256)",
    [
      { name: "operatorAddress", type: "address" },
      { name: "shares", type: "uint256" },
    ],
    [operatorAddress, shares]
  );
}

/**
 * Encodes a `redelegate` function call to move stake from one validator to another.
 *
 * @param fromOperatorAddress - The current validator's address.
 * @param toOperatorAddress - The new validator's address.
 * @param shares - The number of shares to redelegate.
 * @returns Encoded hex string representing the `redelegate(address,address,uint256,bool)` call with `delegateVotePower` set to false.
 */
export function encodeRedelegate(
  fromOperatorAddress: Address,
  toOperatorAddress: Address,
  shares: bigint
): Hex {
  return encodeFunctionCall(
    "redelegate(address,address,uint256,bool)",
    [
      { name: "srcValidator", type: "address" },
      { name: "dstValidator", type: "address" },
      { name: "shares", type: "uint256" },
      { name: "delegateVotePower", type: "bool" },
    ],
    [fromOperatorAddress, toOperatorAddress, shares, false]
  );
}

/**
 * Encodes a `claim` function call to claim unbonded tokens.
 * 
 * @param operatorAddress - The validator address from which the user previously undelegated.
 * @param index - The index (request number) of the unbonding request.
 * @returns Encoded hex string representing the `claim(address,uint256)` call.
 */
export function encodeClaim(operatorAddress: Address, index: bigint): Hex {
  return encodeFunctionCall(
    "claim(address,uint256)",
    [
      { name: "operatorAddress", type: "address" },
      { name: "requestNumber", type: "uint256" },
    ],
    [operatorAddress, index]
  );
}
