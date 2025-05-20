import { Address } from "viem";

export interface Validator {
  id: string;
  status: ValidatorStatus;
  name: string,
  description: string,
  image: string,
  apy: number,
  delegators: number,
  operatorAddress: Address,
  creditAddress: Address,
}

export enum ValidatorStatus {
  Active,
  Inactive,
  Jailed,
}