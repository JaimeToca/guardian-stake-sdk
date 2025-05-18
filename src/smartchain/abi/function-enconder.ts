import { ethers } from "ethers";

const abiCoder = new ethers.AbiCoder();

// https://bscscan.com/address/0x0000000000000000000000000000000000002002#readContract
export function getValidatorsData(): string {
  return encodeFunctionCall(
    "getValidators(uint256,uint256)",
    ["uint256", "uint256"],
    [0, 100]
  );
}

// https://bscscan.com/address/0x4AFc633E7B6bEB8e552ccddbE06Cca3754991E9A#readProxyContract
export function getSharesByPooledBNBData(amount: bigint): string {
    return encodeFunctionCall(
    "getSharesByPooledBNB(uint256)",
    ["uint256"],
    [amount]
  );
}

export function getPooledBNBData(delegator: string): string {
    return encodeFunctionCall(
    "getPooledBNB(address)",
    ["address"],
    [delegator]
  );
}

export function unbondRequestData(delegator: string): string {
    return encodeFunctionCall(
    "unbondRequest(address)",
    ["address"],
    [delegator]
  );
}

export function claimableUnbondRequestData(delegator: string): string {
   return encodeFunctionCall(
    "claimableUnbondRequest(address)",
    ["address"],
    ["delegator"]
  );
}

export function pendingUnbondRequestData(delegator: string): string {
    return encodeFunctionCall(
    "pendingUnbondRequest(address)",
    ["address"],
    [delegator]
  );
}

function encodeFunctionCall(
  functionSignature: string,
  types: string[] = [],
  params: any[] = []
): string {
  const selector = ethers.id(functionSignature).slice(0, 10); // first 4 bytes (8 chars + '0x')
  const encodedArgs = types.length
    ? abiCoder.encode(types, params).slice(2)
    : "";
  return selector + encodedArgs;
}
