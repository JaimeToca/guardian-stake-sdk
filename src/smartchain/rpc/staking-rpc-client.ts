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

/**
 * A client class responsible for interacting with BNB
 * node API calls for staking.
 */
export class StakingRpcClient implements StakingRpcClientContract {
  constructor(private readonly client: PublicClient) {}

  /**
   * Retrieves and decodes the credit contract validators.
   *
   * This method calls the staking contract to get all validators,
   * then decodes the response to separate operator and credit addresses,
   * and finally returns them as a Map.
   *
   * @returns {Promise<DecodedValidators>} A promise that resolves to a Map where keys are operator addresses
   * and values are their corresponding credit contract addresses.
   * @throws {Error} If the response from the staking contract is missing data.
   */
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

  /**
   * Fetches the amount of pooled BNB for a given delegator across multiple credit contracts using a multicall.
   * Currently, there is no indexing API that, given a delegator address, can tell how much balance is staked or
   * active delegation. Therefore, the solution is to call getPooledBNB for all validators using a multicall.
   *
   * @param {Address[]} creditContracts An array of credit contract addresses (validator) to query.
   * @param {Address} delegator The address of the delegator whose pooled BNB data is being requested.
   * @returns {Promise<MulticallResult[]>} A promise that resolves to an array of multicall results,
   * where each result corresponds to a query on a credit contract. `allowFailure` is set to `true`,
   * meaning individual call failures will be returned as errors within the result array rather than
   * causing the entire multicall to fail.
   */
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

  /**
   * Retrieves the pending unbond delegation requests for a given delegator across multiple credit contracts.
   * Currently, there is no indexing API that, given a delegator address, what are the pending delegations
   * and to which validators it belongs, therefore multicall is required.
   *
   * @param creditContracts An array of `Address` (string) representing the addresses of the credit contracts to query.
   * @param delegator The `Address` (string) of the delegator whose pending unbond requests are to be retrieved.
   * @returns A Promise that resolves to an array of `MulticallResult`. Each `MulticallResult`
   * will contain the result of the `pendingUnbondRequest` call for the corresponding credit contract.
   * If a call fails (e.g., due to a network error or contract revert), `allowFailure: true`
   * ensures that the multicall still returns results for successful calls, with failed calls
   * having an `error` property.
   */
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

  /**
   * Retrieves specific unbond request data for a given delegator and index from a credit contract.
   * This function interacts directly with a smart contract to fetch detailed information about a particular
   * unbonding request, such as the amount of shares, the corresponding token amount, and the unlock time.
   *
   * @param creditContract The `Address` of the credit contract where the unbond request is stored.
   * @param delegator The `Address` of the delegator who initiated the unbond request.
   * @param index A `bigint` representing the specific index of the unbond request for the given delegator.
   * Delegators can have multiple unbond requests, and this index helps identify a particular one.
   * @returns A Promise that resolves to a `DecodedUnbondRequest` object containing the shares,
   * amount, and unlock time of the unbond request.
   * @throws {Error} If the response data from the contract call is missing, indicating a potential
   * issue with the contract interaction or an unexpected empty response.
   */
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

    const decodedUnbondResponse = decodeUnbond(unbondRequestDataResponse.data);

    return {
      shares: decodedUnbondResponse[0],
      amount: decodedUnbondResponse[1],
      unlockTime: decodedUnbondResponse[2],
    };
  }

   /**
   * Retrieves the number of shares that can be obtained for a given amount of pooled BNB
   * from a specified credit contract.
   *
   * @param creditContract The **address** of the credit contract to query.
   * @param amount The **amount** of pooled BNB (as a `bigint`) for which to calculate the corresponding shares.
   */
  async getSharesByPooledBNBData(creditContract: Address, amount: bigint) {
    const validatorsResponse = this.client.call({
      to: creditContract,
      data: encodeGetSharesByPooledBNBData(amount),
    });
    console.log(validatorsResponse);
  }
}
