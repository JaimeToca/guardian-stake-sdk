import { Address, decodeAbiParameters, DecodeAbiParametersReturnType, Hex } from "viem";

/**
 * Decodes the result of a `getValidators(uint256,uint256)` call.
 *
 * The returned data includes:
 * - A list of validator operator addresses
 * - A list of credit contract addresses (linked to each validator)
 * - The total number of validators returned
 *
 * @param data - Hex-encoded return data from the contract call.
 * @returns A tuple of [operator addresses[], credit addresses[], total count]
 */
export function decodeGetValidators(data: Hex): [Address[], Address[], bigint]  {
   const decodedResult = decodeAbiParameters(
    [
      { name: "operatorAddrs", type: "address[]" },
      { name: "creditAddrs", type: "address[]" },
      { name: "totalLength", type: "uint256" },
    ],
    data
  );

  return [
    decodedResult[0] as Address[],
    decodedResult[1] as Address[],
    decodedResult[2],
  ];
}

/**
 * Decodes the result of an `unbondRequest(address,uint256)` call.
 *
 * The returned data includes:
 * - The number of shares being unbonded
 * - The corresponding BNB amount
 * - The unlock time (timestamp after which funds can be claimed)
 *
 * @param data - Hex-encoded return data from the contract call.
 * @returns A tuple of [shares, BNB amount, unlock time]
 */
export function decodeUnbond(data: Hex): [bigint, bigint, bigint]  {
   const decodedResult = decodeAbiParameters(
    [
      { name: "shares", type: "uint256" },
      { name: "bnbAmount", type: "uint256" },
      { name: "unlockTime", type: "uint256" },
    ],
    data
  );

  return [
    decodedResult[0],
    decodedResult[1],
    decodedResult[2],
  ];
}