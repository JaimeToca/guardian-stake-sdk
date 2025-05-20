import { encodeFunctionCall } from "./abi-utils";
import { Address, Hex } from "viem";

// https://bscscan.com/address/0x0000000000000000000000000000000000002002#readContract
// https://bscscan.com/address/0x4AFc633E7B6bEB8e552ccddbE06Cca3754991E9A#readProxyContract
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
    [{ name: "accout", type: "address" }],
    [delegator]
  );
}

export function encodeUnbondRequestData(delegator: Address): Hex {
  return encodeFunctionCall(
    "unbondRequest(address)",
    [
      { name: "delegator", type: "address" },
      { name: "_index", type: "uint256" },
    ],
    [delegator, 0]
  );
}

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
