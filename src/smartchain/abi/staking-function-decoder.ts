import { Address, decodeAbiParameters, DecodeAbiParametersReturnType, Hex } from "viem";

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