import type {
  Delegations,
  GetValidatorsParams,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";

export interface TronStakingServiceContract {
  getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage>;
  getDelegations(address: string): Promise<Delegations>;
  getWitnessMap(): Promise<Map<string, Validator>>;
}
