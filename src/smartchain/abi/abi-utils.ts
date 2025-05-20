import {
  AbiParameter,
  encodeAbiParameters,
  Hex,
  toFunctionSelector,
} from "viem";

export const STAKING_CONTRACT = "0x0000000000000000000000000000000000002002"

export function encodeFunctionCall(
  functionSignature: string,
  types: AbiParameter[] = [],
  params: unknown[] = []
): Hex {
  const selector = toFunctionSelector(functionSignature);
  const encodedArgs = types.length
    ? encodeAbiParameters(types, params).slice(2)
    : "";
    
  return (`${selector}${encodedArgs}`) as Hex;
}
