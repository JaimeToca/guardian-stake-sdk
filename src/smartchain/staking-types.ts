interface Validator {
  id: number;
  status: ValidatorStatus;
  name: string,
  description: string,
  image: string,
  apy: number,
  operatorAddress: string,
}

enum ValidatorStatus {
  Active,
  Inactive,
  Jailed,
}
