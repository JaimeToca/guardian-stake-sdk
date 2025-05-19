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
