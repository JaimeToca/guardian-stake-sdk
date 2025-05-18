import { BytesLike, Result } from "ethers";
import { abiCoder } from "./abi-utils";

export function decodeGetValidators(data: BytesLike): Result {
    return abiCoder.decode(["address[]", "address[]", "uint256"], data)
}