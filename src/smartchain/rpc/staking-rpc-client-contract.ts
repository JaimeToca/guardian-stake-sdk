import { Address } from "viem";
import { DecodedValidators, MulticallResult } from "../abi/types";

export interface StakingRpcClientContract {
  getCreditContractValidators(): Promise<DecodedValidators>;
  getClaimableUnbondDelegation(contract: string, address: string): void;
  getPendingUnbondDelegation(contract: string, address: string): void;
  getPooledBNBData(creditContracts: Address[], delegator: Address): Promise<MulticallResult[]> ;
  getSharesByPooledBNBData(contract: string, amount: bigint): void;
}
