import {
  encodeClaimableUnbondRequestData,
  encodeGetPooledBNBData,
  encodeGetSharesByPooledBNBData,
  encodeGetValidatorsData,
  encodePendingUnbondRequestData,
} from "../abi/staking-function-enconder";
import { decodeGetValidators } from "../abi/staking-function-decoder";
import { DecodedValidators } from "../abi/types";
import { StakingRpcClientContract } from "./staking-rpc-client-contract";
import { Address, Hex, PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/abi-utils";

export class StakingRpcClient implements StakingRpcClientContract {
  constructor(private readonly client: PublicClient) {}

  async getValidatorsCreditContracts(): Promise<DecodedValidators> {
    const validatorsResponse = await this.client.call({
      data: encodeGetValidatorsData(),
      to: STAKING_CONTRACT,
    });

    if (!validatorsResponse.data) {
      throw new Error(
        "Missing data for call getValidatorsCreditContracts(contract)"
      );
    }

    const decodedReponse = decodeGetValidators(validatorsResponse.data);
    const operatorAddresses = decodedReponse[0] as Address[]
    const creditAddresses = decodedReponse[1] as Address[]
    
    return new Map(operatorAddresses.map((operatorAddress, index) => {
      return [operatorAddress, creditAddresses[index]]
    }))
  }

  async getClaimableUnbondDelegation(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: encodeClaimableUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }

  async getPendingUnbondDelegation(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: encodePendingUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }

  async getPooledBNBData(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: encodeGetPooledBNBData(delegator),
    });
    console.log(validatorsResponse);
  }

  async getSharesByPooledBNBData(contract: Address, amount: bigint) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: encodeGetSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }
}
