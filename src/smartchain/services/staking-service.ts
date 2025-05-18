import { Validator } from "../staking-types";

class StakingService {
    getValidators(): Promise<Validator[]> {
        throw new Error("Method not implemented.");
    }
    getDelegations(): Promise<Validator[]> {
        throw new Error("Method not implemented.");
    }
}