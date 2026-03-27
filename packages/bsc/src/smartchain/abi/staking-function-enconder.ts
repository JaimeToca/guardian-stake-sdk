import { encodeFunctionCall } from "./abi-utils";
import { Address, Hex } from "viem";

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

export function encodeGetSharesByPooledBNBData(amount: bigint): Hex {
  return encodeFunctionCall(
    "getSharesByPooledBNB(uint256)",
    [{ name: "bnbAmount", type: "uint256" }],
    [amount]
  );
}

export function encodeGetPooledBNBData(delegator: Address): Hex {
  return encodeFunctionCall(
    "getPooledBNB(address)",
    [{ name: "account", type: "address" }],
    [delegator]
  );
}

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

export function encodePendingUnbondRequestData(delegator: Address): Hex {
  return encodeFunctionCall(
    "pendingUnbondRequest(address)",
    [{ name: "delegator", type: "address" }],
    [delegator]
  );
}

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
