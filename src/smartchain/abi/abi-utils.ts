import {
  AbiParameter,
  encodeAbiParameters,
  Hex,
  toFunctionSelector,
} from "viem";
import { MulticallResult } from "./abi-types";

/**
 * Encodes a contract function call into a hex string.
 * 
 * @param functionSignature - The function signature in Solidity format (e.g., "balanceOf(address)").
 * @param types - ABI parameter types describing the function arguments.
 * @param params - The actual argument values to encode.
 * 
 * @returns Hex-encoded function call data, including selector and encoded parameters.
 */
export function encodeFunctionCall(
  functionSignature: string,
  types: AbiParameter[] = [],
  params: unknown[] = []
): Hex {
  const selector = toFunctionSelector(functionSignature);
  const encodedArgs = types.length
    ? encodeAbiParameters(types, params).slice(2)
    : "";

  return `${selector}${encodedArgs}` as Hex;
}

/**
 * Processes a single result from a multicall.
 * 
 * @param item - The result item from a multicall operation.
 * 
 * @returns The `bigint` result if successful and greater than zero, otherwise `undefined`.
 */
export function processSingleMulticallResult(
  item: MulticallResult
): bigint | undefined {
  if (
    item.status === `success` &&
    item.result !== undefined &&
    item.result > 0
  ) {
    return item.result;
  } else if (item.status === `failure`) {
    return undefined;
  } else {
    return undefined;
  }
}
