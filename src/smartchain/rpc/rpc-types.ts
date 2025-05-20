interface BNBChainValidator {
  apy: number;
  bcOperatorAddress: string;
  commission: number;
  createdAt: number;
  delegatorCount: number;
  miningStatus: string;
  moniker: string;
  operatorAddress: string;
  status: string;
  totalStaked: string;
}

interface BNBValidatorData {
  total: number;
  validators: BNBChainValidator[];
}

interface BNBValidatorsResponse {
  code: number;
  data: BNBValidatorData;
}