interface SmartChainValidator {
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

interface SmartChainValidatorData {
  total: number;
  validators: SmartChainValidator[];
}

interface SmartChainValidatorsResponse {
  code: number;
  data: SmartChainValidatorData;
}