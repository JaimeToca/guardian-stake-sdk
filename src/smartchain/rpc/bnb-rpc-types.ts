export interface BNBChainValidator {
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

export interface BNBValidatorData {
  total: number;
  validators: BNBChainValidator[];
}

export interface BNBValidatorsResponse {
  code: number;
  data: BNBValidatorData;
}

export interface BNBStakingSummary {
  activeValidators: number;
  maxApy: number;
  totalStaked: string;
  totalValidators: number;
}

export interface BNBStakingData {
  summary: BNBStakingSummary;
}

export interface StakingResponse {
  code: number;
  data: BNBStakingData;
}