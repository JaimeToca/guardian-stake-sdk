import {
  encodeClaimableUnbondRequestData,
  encodeGetSharesByPooledBNBData,
  encodeGetValidatorsData,
  encodePendingUnbondRequestData,
} from "../abi/staking-function-enconder";
import { decodeGetValidators } from "../abi/staking-function-decoder";
import { DecodedValidators, MulticallResult } from "../abi/types";
import { StakingRpcClientContract } from "./staking-rpc-client-contract";
import { Address, PublicClient } from "viem";
import { multicallStakeAbi } from "../abi/stake-abi";

export class StakingRpcClient implements StakingRpcClientContract {
  static STAKING_CONTRACT: Address =
    '0x0000000000000000000000000000000000002002';

  constructor(private readonly client: PublicClient) {}

  async getCreditContractValidators(): Promise<DecodedValidators> {
    const validatorsResponse = await this.client.call({
      data: encodeGetValidatorsData(),
      to: StakingRpcClient.STAKING_CONTRACT,
    });

    if (!validatorsResponse.data) {
      throw new Error(
        'Missing data for call getValidatorsCreditContracts(contract)'
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

  async getPooledBNBData(creditContracts: Address[], delegator: Address): Promise<MulticallResult[]> {
    const multicallContracts = creditContracts.map((creditContract) => {
      return {
        address: creditContract,
        abi: multicallStakeAbi,
        functionName: 'getPooledBNB',
        args: [delegator],
      };
    });

    return this.client.multicall({
      contracts: multicallContracts,
      allowFailure: true,
    });
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
