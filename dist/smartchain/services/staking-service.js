"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingService = void 0;
const staking_types_1 = require("./staking-types");
class StakingService {
    constructor(stakingRpcClient, bnbRpcClient) {
        this.stakingRpcClient = stakingRpcClient;
        this.bnbRpcClient = bnbRpcClient;
    }
    async getValidators() {
        const [bnbValidators, contractCallValidators] = await Promise.all([
            this.bnbRpcClient.getValidators(),
            this.stakingRpcClient.getValidatorsCreditContracts(),
        ]);
        return bnbValidators.map((bnbValidator, index) => {
            const operatorAddress = bnbValidator.operatorAddress;
            return {
                id: `${index}-${bnbValidator.moniker}`,
                status: this.getValidatorStatus(bnbValidator),
                name: bnbValidator.moniker,
                description: bnbValidator.miningStatus,
                image: this.getValidatorImage(operatorAddress),
                apy: bnbValidator.apy * 100,
                delegators: bnbValidator.delegatorCount,
                operatorAddress: operatorAddress,
                creditAddress: contractCallValidators.get(operatorAddress),
            };
        });
    }
    getValidatorStatus(bnbValidator) {
        switch (bnbValidator.status) {
            case "INACTIVE":
                return staking_types_1.ValidatorStatus.Inactive;
            case "JAILED":
                return staking_types_1.ValidatorStatus.Jailed;
            default:
                return staking_types_1.ValidatorStatus.Active;
        }
    }
    getValidatorImage(address) {
        const BASE_VALIDATOR_IMAGE_URL = `https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/`;
        const LOGO_FILE = `/logo.png`;
        return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
    }
    async getDelegations(address) {
        const validatorsContract = (await this.stakingRpcClient.getValidatorsCreditContracts()).values();
        const activeDelegations = this.stakingRpcClient.getPooledBNBData(Array.from(validatorsContract), address);
        console.log(activeDelegations);
        return {
            delegations: [],
            stakingSummary: {
                totalProtocolStake: 0,
                maxApy: 0,
                minAmountToStake: 0,
                unboundPeriod: 0,
                redelegateFeeRate: 0,
                activeValidators: 0,
                inactiveValidators: 0,
                jailedValidators: 0,
                totalValidators: 0,
            }
        };
    }
    getActiveDelegations() {
    }
    getPendingDelegations() {
    }
}
exports.StakingService = StakingService;
//# sourceMappingURL=staking-service.js.map