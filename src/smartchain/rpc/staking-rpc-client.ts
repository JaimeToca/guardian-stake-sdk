import { StakingRpcClientContract } from "./staking-rpc-client-contract";
import { Address, PublicClient } from "viem";
import {
  DecodedValidators,
  MulticallResult,
  DecodedUnbondRequest,
  multicallStakeAbi,
  STAKING_CONTRACT,
  decodeGetValidators,
  encodeGetSharesByPooledBNBData,
  encodeGetValidatorsData,
  encodeUnbondRequestData,
  decodeUnbond,
} from "../abi";

export class StakingRpcClient implements StakingRpcClientContract {
  constructor(private readonly client: PublicClient) {}

  async getCreditContractValidators(): Promise<DecodedValidators> {
    const validatorsResponse = await this.client.call({
      data: encodeGetValidatorsData(),
      to: STAKING_CONTRACT,
    });

    if (!validatorsResponse.data) {
      throw new Error(
        "Missing data for call getValidatorsCreditContracts(contract)"
      );
    }

    const decodedValidatorResponse = decodeGetValidators(
      validatorsResponse.data
    );
    const operatorAddresses = decodedValidatorResponse[0] as Address[];
    const creditAddresses = decodedValidatorResponse[1] as Address[];

    return new Map(
      operatorAddresses.map((operatorAddress, index) => {
        return [operatorAddress, creditAddresses[index]];
      })
    );
  }

  async getPooledBNBData(
    creditContracts: Address[],
    delegator: Address
  ): Promise<MulticallResult[]> {
    const multicallContracts = creditContracts.map((creditContract) => {
      return {
        address: creditContract,
        abi: multicallStakeAbi,
        functionName: "getPooledBNB",
        args: [delegator],
      };
    });

    return this.client.multicall({
      contracts: multicallContracts,
      allowFailure: true,
    });
  }

  async getPendingUnbondDelegation(
    creditContracts: Address[],
    delegator: Address
  ): Promise<MulticallResult[]> {
    const multicallContracts = creditContracts.map((creditContract) => {
      return {
        address: creditContract,
        abi: multicallStakeAbi,
        functionName: "pendingUnbondRequest",
        args: [delegator],
      };
    });

    return this.client.multicall({
      contracts: multicallContracts,
      allowFailure: true,
    });
  }

  async getUnbondRequestData(
    creditContract: Address,
    delegator: Address,
    index: bigint
  ): Promise<DecodedUnbondRequest> {
    const unbondRequestDataResponse = await this.client.call({
      data: encodeUnbondRequestData(delegator, index),
      to: creditContract,
    });

    if (!unbondRequestDataResponse.data) {
      throw new Error(
        "Missing data for call getUnbondRequestData(delegator, index)"
      );
    }

    const decodedUnbondResponse = decodeUnbond(
      unbondRequestDataResponse.data
    );

    return {
      shares: decodedUnbondResponse[0],
      amount: decodedUnbondResponse[1],
      unlockTime: decodedUnbondResponse[2],
    };
  }

  async getSharesByPooledBNBData(creditContract: Address, amount: bigint) {
    const validatorsResponse = this.client.call({
      to: creditContract,
      data: encodeGetSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }
}
