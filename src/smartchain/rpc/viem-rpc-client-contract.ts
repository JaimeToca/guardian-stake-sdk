import { DecodedValidators } from "../abi/types";

export interface ViemRpcClientContract {
  getValidatorsCreditContracts(): Promise<DecodedValidators>;
  getClaimableUnbondDelegation(contract: string, address: string): void;
  getPendingUnbondDelegation(contract: string, address: string): void;
  getPooledBNBData(contract: string, address: string): void;
  getSharesByPooledBNBData(contract: string, amount: bigint): void;
}
