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

export function createStakingRpcClient(
  client: PublicClient,
  logger: Logger = new NoopLogger()
): StakingRpcClientContract {
  return {
    async getCreditContractValidators(): Promise<DecodedValidators> {
      logger.debug("StakingRpcClient: getCreditContractValidators");
      const res = await client.call({ data: encodeGetValidatorsData(), to: STAKING_CONTRACT });
      const decoded = decodeGetValidators(res.data!);
      const operatorAddresses = decoded[0] as Address[];
      const creditAddresses = decoded[1] as Address[];
      return new Map(operatorAddresses.map((addr, i) => [addr, creditAddresses[i]]));
    },

    async getPooledBNBData(creditContracts, delegator): Promise<MulticallResult[]> {
      logger.debug("StakingRpcClient: multicall getPooledBNB", {
        contracts: creditContracts.length,
      });
      return client.multicall({
        contracts: creditContracts.map((address) => ({
          address,
          abi: multicallStakeAbi,
          functionName: "getPooledBNB",
          args: [delegator],
        })),
        allowFailure: true,
      });
    },

    async getPendingUnbondDelegation(creditContracts, delegator): Promise<MulticallResult[]> {
      logger.debug("StakingRpcClient: multicall pendingUnbondRequest", {
        contracts: creditContracts.length,
      });
      return client.multicall({
        contracts: creditContracts.map((address) => ({
          address,
          abi: multicallStakeAbi,
          functionName: "pendingUnbondRequest",
          args: [delegator],
        })),
        allowFailure: true,
      });
    },

    async getUnbondRequestData(creditContract, delegator, index): Promise<DecodedUnbondRequest> {
      const res = await client.call({
        data: encodeUnbondRequestData(delegator, index),
        to: creditContract,
      });
      const decoded = decodeUnbond(res.data!);
      return { shares: decoded[0], amount: decoded[1], unlockTime: decoded[2] };
    },

    async getShareBalance(creditContract, delegator): Promise<bigint> {
      const res = await client.call({ to: creditContract, data: encodeBalanceOf(delegator) });
      return decodeAbiParameters([{ name: "shares", type: "uint256" }], res.data!)[0];
    },

    async getSharesByPooledBNBData(creditContract, amount): Promise<bigint> {
      const res = await client.call({
        to: creditContract,
        data: encodeGetSharesByPooledBNBData(amount),
      });
      return decodeAbiParameters([{ name: "shares", type: "uint256" }], res.data!)[0];
    },
  };
}
