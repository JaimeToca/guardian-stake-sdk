import {
  claimableUnbondRequestData,
  getPooledBNBData,
  getSharesByPooledBNBData,
  getValidatorsData,
  pendingUnbondRequestData,
} from "../abi/staking-function-enconder";
import { decodeGetValidators } from "../abi/staking-function-decoder";
import { DecodedValidators } from "../abi/types";
import { ViemRpcClientContract } from "./viem-rpc-client-contract";
import { Address, Hex, PublicClient } from "viem";

export class ViemRpcClient implements ViemRpcClientContract {
  constructor(private readonly client: PublicClient) {}

  async getValidatorsCreditContracts(
    contract: Address
  ): Promise<DecodedValidators> {
    const validatorsResponse = await this.client.call({
      data: getValidatorsData(),
      to: contract,
    });

    if (!validatorsResponse.data) {
      throw new Error(
        "Missing data for call getValidatorsCreditContracts(contract)"
      );
    }

    const decodedReponse = decodeGetValidators(validatorsResponse.data);

    const decodedValidators: DecodedValidators = {
      operatorAddresses: decodedReponse[0] as Address[],
      creditAddresses: decodedReponse[1] as Address[],
    };

    return decodedValidators;
  }

  async getClaimableUnbondDelegation(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: claimableUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }

  async getPendingUnbondDelegation(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: pendingUnbondRequestData(delegator),
    });

    console.log(validatorsResponse);
  }

  async getPooledBNBData(contract: Address, delegator: Address) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: getPooledBNBData(delegator),
    });
    console.log(validatorsResponse);
  }

  async getSharesByPooledBNBData(contract: Address, amount: bigint) {
    const validatorsResponse = this.client.call({
      to: contract,
      data: getSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }
}
