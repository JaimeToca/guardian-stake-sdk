import {
  AbiParameter,
  encodeAbiParameters,
  Hex,
  toFunctionSelector,
} from "viem";
import { MulticallResult } from "./types";

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
