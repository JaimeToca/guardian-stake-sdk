import { Address } from "viem";

export interface DecodedValidators {
    operatorAddresses: Address[],
    creditAddresses: Address[]
}