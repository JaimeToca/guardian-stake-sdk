import type { StakingRpcClientContract } from "./staking-rpc-client-contract";
import type { Address, Hex, PublicClient } from "viem";
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
import { ApiError, ApiErrorType, NoopLogger } from "@guardian-sdk/sdk";

/**
 * Guards a `client.call()` result before it's handed to an ABI decoder
 * (M-BSC-3). `res.data!` previously masked an empty/missing response,
 * letting viem throw an opaque, low-level decode error (e.g.
 * `AbiDecodingZeroDataError`) instead of a typed SDK error. `context` names
 * the call site only — never any address/amount that could leak into the
 * thrown message.
 */
function assertCallData(res: { data?: Hex } | undefined, context: string): Hex {
  const data = res?.data;
  if (data === undefined || data === "0x") {
    throw new ApiError(`StakingRpcClient: empty response from ${context}.`, {
      type: ApiErrorType.ServerResponseError,
    });
  }
  return data;
}

export function createStakingRpcClient(
  client: PublicClient,
  logger: Logger = new NoopLogger()
): StakingRpcClientContract {
  return {
    async getCreditContractValidators(): Promise<DecodedValidators> {
      logger.debug("StakingRpcClient: getCreditContractValidators");
      const res = await client.call({ data: encodeGetValidatorsData(), to: STAKING_CONTRACT });
      const data = assertCallData(res, "getCreditContractValidators");
      const decoded = decodeGetValidators(data);
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
      const data = assertCallData(res, "getUnbondRequestData");
      const decoded = decodeUnbond(data);
      return { shares: decoded[0], amount: decoded[1], unlockTime: decoded[2] };
    },

    async getShareBalance(creditContract, delegator): Promise<bigint> {
      const res = await client.call({ to: creditContract, data: encodeBalanceOf(delegator) });
      const data = assertCallData(res, "getShareBalance");
      return decodeAbiParameters([{ name: "shares", type: "uint256" }], data)[0];
    },

    async getSharesByPooledBNBData(creditContract, amount): Promise<bigint> {
      const res = await client.call({
        to: creditContract,
        data: encodeGetSharesByPooledBNBData(amount),
      });
      const data = assertCallData(res, "getSharesByPooledBNBData");
      return decodeAbiParameters([{ name: "shares", type: "uint256" }], data)[0];
    },
  };
}
