import { Validator } from "../staking-types";

interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(): Promise<Validator[]>;
}
