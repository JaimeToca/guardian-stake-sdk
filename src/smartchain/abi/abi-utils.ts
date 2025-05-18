import { ethers } from "ethers";

export const abiCoder = new ethers.AbiCoder();

export function encodeFunctionCall(
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
