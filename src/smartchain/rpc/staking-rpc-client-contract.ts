import { Address } from "viem";
import { DecodedUnbondRequest, DecodedValidators, MulticallResult } from "../abi/types";

export interface StakingRpcClientContract {
  getCreditContractValidators(): Promise<DecodedValidators>;
  getClaimableUnbondDelegation(contract: Address, address: Address): void;
  getPendingUnbondDelegation(creditContracts: Address[], address: Address): Promise<MulticallResult[]>;
  getPooledBNBData(creditContracts: Address[], delegator: Address): Promise<MulticallResult[]>;
  getUnbondRequestData(creditContract: Address, delegator: Address, index: bigint): Promise<DecodedUnbondRequest>;
  getSharesByPooledBNBData(contract: Address, amount: bigint): void;
}
