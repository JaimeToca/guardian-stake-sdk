import {
  AbiParameter,
  encodeAbiParameters,
  Hex,
  toFunctionSelector,
} from "viem";

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
