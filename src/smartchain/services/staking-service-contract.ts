import { Validator } from "../staking-types";

export interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(): Promise<Validator[]>;
}
