import { Address } from "viem";
import { DecodedValidators } from "../abi/types";

export interface StakingRpcClientContract {
  getCreditContractValidators(): Promise<DecodedValidators>;
  getClaimableUnbondDelegation(contract: string, address: string): void;
  getPendingUnbondDelegation(contract: string, address: string): void;
  getPooledBNBData(creditContracts: Address[], delegator: Address): void;
  getSharesByPooledBNBData(contract: string, amount: bigint): void;
}
