import { Address } from "viem";
import { Delegations, Validator } from "./staking-types";

export interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: Address): Promise<Delegations>;
}