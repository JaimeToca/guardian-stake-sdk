import type { Address } from "viem";
import type { DecodedUnbondRequest, DecodedValidators, MulticallResult } from "../abi/abi-types";

export interface StakingRpcClientContract {
  getCreditContractValidators(): Promise<DecodedValidators>;
  getPendingUnbondDelegation(
    creditContracts: Address[],
    address: Address
  ): Promise<MulticallResult[]>;
  getPooledBNBData(creditContracts: Address[], delegator: Address): Promise<MulticallResult[]>;
  getUnbondRequestData(
    creditContract: Address,
    delegator: Address,
    index: bigint
  ): Promise<DecodedUnbondRequest>;
  getSharesByPooledBNBData(contract: Address, amount: bigint): Promise<bigint>;
  getShareBalance(creditContract: Address, delegator: Address): Promise<bigint>;
}
