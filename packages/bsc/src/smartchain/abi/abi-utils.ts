import type { AbiParameter, Hex } from "viem";
import { encodeAbiParameters, toFunctionSelector } from "viem";
import type { MulticallResult } from "./abi-types";

export function encodeFunctionCall(
  functionSignature: string,
  types: AbiParameter[] = [],
  params: unknown[] = []
): Hex {
  const selector = toFunctionSelector(functionSignature);
  const encodedArgs = types.length ? encodeAbiParameters(types, params).slice(2) : "";

  return `${selector}${encodedArgs}` as Hex;
}

export function processSingleMulticallResult(item: MulticallResult): bigint | undefined {
  if (item.status === "success" && item.result !== undefined && item.result > 0n) {
    return item.result;
  }
  return undefined;
}
