import { AddressLike } from "ethers";

interface Validator {
  id: number;
  status: ValidatorStatus;
  name: string,
  description: string,
  image: string,
  apy: number,
  operatorAddress: string,
  creditAddress: string,
}

enum ValidatorStatus {
  Active,
  Inactive,
  Jailed,
}

interface Delegation {
  
}