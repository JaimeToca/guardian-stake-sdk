import {
  encodeClaimableUnbondRequestData,
  encodeGetSharesByPooledBNBData,
  encodeGetValidatorsData,
  encodePendingUnbondRequestData,
} from "../abi/staking-function-enconder";
import { decodeGetValidators } from "../abi/staking-function-decoder";
import { DecodedValidators } from "../abi/types";
import { StakingRpcClientContract } from "./staking-rpc-client-contract";
import { Address, parseAbi, PublicClient } from "viem";
import { STAKING_CONTRACT } from "../abi/abi-utils";
import { stakeCreditAbi } from "../abi/stake-abi";

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
    const operatorAddresses = decodedReponse[0] as Address[];
    const creditAddresses = decodedReponse[1] as Address[];

    return new Map(
      operatorAddresses.map((operatorAddress, index) => {
        return [operatorAddress, creditAddresses[index]];
      })
    );
  }

  async getPooledBNBData(creditContracts: Address[], delegator: Address) {
    const multicallContracts = creditContracts.map((creditContract) => {
      return {
        address: creditContract,
        abi: stakeCreditAbi,
        functionName: "getPooledBNB",
        args: [delegator],
      };
    });

    const multicallResult = await this.client.multicall({
      contracts: multicallContracts,
      allowFailure: true,
    });

    console.log(multicallResult[0].status)
    console.log(multicallResult[0].result)
    console.log(multicallResult[0].error)


    console.log(multicallResult)
  }

  async getPendingUnbondDelegation(
    creditContract: Address,
    delegator: Address
  ) {
    const validatorsResponse = this.client.call({
      to: creditContract,
      data: encodePendingUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }

  async getSharesByPooledBNBData(creditContract: Address, amount: bigint) {
    const validatorsResponse = this.client.call({
      to: creditContract,
      data: encodeGetSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }

  async getClaimableUnbondDelegation(
    creditContract: Address,
    delegator: Address
  ) {
    const validatorsResponse = this.client.call({
      to: creditContract,
      data: encodeClaimableUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }
}
