import type { StakingRpcClientContract } from "./staking-rpc-client-contract";
import type { Address, PublicClient } from "viem";
import { decodeAbiParameters } from "viem";
import type { DecodedValidators, MulticallResult, DecodedUnbondRequest } from "../abi";
import {
  multicallStakeAbi,
  STAKING_CONTRACT,
  decodeGetValidators,
  encodeBalanceOf,
  encodeGetSharesByPooledBNBData,
  encodeGetValidatorsData,
  encodeUnbondRequestData,
  decodeUnbond,
} from "../abi";
import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";

export class StakingRpcClient implements StakingRpcClientContract {
  constructor(
    private readonly client: PublicClient,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async getCreditContractValidators(): Promise<DecodedValidators> {
    this.logger.debug("StakingRpcClient: getCreditContractValidators");
    const validatorsResponse = await this.client.call({
      data: encodeGetValidatorsData(),
      to: STAKING_CONTRACT,
    });

    if (!validatorsResponse.data) {
      throw new Error("Missing data for call getValidatorsCreditContracts(contract)");
    }

    const decodedValidatorResponse = decodeGetValidators(validatorsResponse.data);
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
    this.logger.debug("StakingRpcClient: multicall getPooledBNB", {
      contracts: creditContracts.length,
    });
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
    this.logger.debug("StakingRpcClient: multicall pendingUnbondRequest", {
      contracts: creditContracts.length,
    });
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
      throw new Error("Missing data for call getUnbondRequestData(delegator, index)");
    }

    const decodedUnbondResponse = decodeUnbond(unbondRequestDataResponse.data);

    return {
      shares: decodedUnbondResponse[0],
      amount: decodedUnbondResponse[1],
      unlockTime: decodedUnbondResponse[2],
    };
  }

  async getShareBalance(creditContract: Address, delegator: Address): Promise<bigint> {
    const response = await this.client.call({
      to: creditContract,
      data: encodeBalanceOf(delegator),
    });
    if (!response.data) {
      throw new Error(`Missing data for call balanceOf(${delegator}) on ${creditContract}`);
    }
    const decoded = decodeAbiParameters([{ name: "shares", type: "uint256" }], response.data);
    return decoded[0];
  }

  async getSharesByPooledBNBData(creditContract: Address, amount: bigint): Promise<bigint> {
    const response = await this.client.call({
      to: creditContract,
      data: encodeGetSharesByPooledBNBData(amount),
    });
    if (!response.data) {
      throw new Error(`Missing data for call getSharesByPooledBNB(${amount}) on ${creditContract}`);
    }
    const decoded = decodeAbiParameters([{ name: "shares", type: "uint256" }], response.data);
    return decoded[0];
  }
}
