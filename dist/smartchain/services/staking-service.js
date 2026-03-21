"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingService = void 0;
const viem_1 = require("viem");
const abi_1 = require("../abi");
const common_1 = require("../../common");
class StakingService {
    cache;
    stakingRpcClient;
    bnbRpcClient;
    static UNBOUND_PERIOD = 604800000;
    static REDELEGATION_FEE = 0.02;
    static MIN_AMOUNT_TO_STAKE = (0, viem_1.parseEther)("1.0");
    static VALIDATOR_CACHE_KEY = "bsc-validators";
    constructor(cache, stakingRpcClient, bnbRpcClient) {
        this.cache = cache;
        this.stakingRpcClient = stakingRpcClient;
        this.bnbRpcClient = bnbRpcClient;
    }
    async getValidators() {
        const cached = this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
        if (cached)
            return cached;
        const [bnbValidators, contractCallValidators] = await Promise.all([
            this.bnbRpcClient.getValidators(),
            this.stakingRpcClient.getCreditContractValidators(),
        ]);
        const validators = bnbValidators.map((bnbValidator, index) => {
            const operatorAddress = bnbValidator.operatorAddress;
            return {
                id: `${bnbValidator.moniker}_${index}`,
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
        this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);
        return validators;
    }
    getValidatorStatus(bnbValidator) {
        switch (bnbValidator.status) {
            case "INACTIVE":
                return common_1.ValidatorStatus.Inactive;
            case "JAILED":
                return common_1.ValidatorStatus.Jailed;
            default:
                return common_1.ValidatorStatus.Active;
        }
    }
    getValidatorImage(address) {
        const BASE_VALIDATOR_IMAGE_URL = "https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/";
        const LOGO_FILE = "/logo.png";
        return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
    }
    async getDelegations(address) {
        const stakingSummaryPromise = this.bnbRpcClient.getStakingSummary();
        const validators = await this.getValidators();
        const activeDelegationsPromise = this.getActiveDelegations(address, validators);
        const pendingDelegationsPromise = this.getPendingOrClaimableDelegations(address, validators);
        const [stakingSummary, activeDelegations, pendingDelegations] = await Promise.all([
            stakingSummaryPromise,
            activeDelegationsPromise,
            pendingDelegationsPromise,
        ]);
        return {
            delegations: activeDelegations.concat(pendingDelegations),
            stakingSummary: {
                totalProtocolStake: Number(stakingSummary.totalStaked),
                maxApy: stakingSummary.maxApy * 100,
                minAmountToStake: StakingService.MIN_AMOUNT_TO_STAKE,
                unboundPeriodInMillis: StakingService.UNBOUND_PERIOD,
                redelegateFeeRate: StakingService.REDELEGATION_FEE,
                activeValidators: stakingSummary.activeValidators,
                totalValidators: stakingSummary.totalValidators,
            },
        };
    }
    async getActiveDelegations(address, validators) {
        const creditContractValidators = validators.map((validator) => validator.creditAddress);
        const pooledBNBData = await this.stakingRpcClient.getPooledBNBData(creditContractValidators, address);
        return pooledBNBData
            .map((data, index) => {
            const stakedAmount = (0, abi_1.processSingleMulticallResult)(data);
            if (stakedAmount === undefined) {
                return undefined;
            }
            return {
                id: `delegation_active_${index}`,
                validator: validators[index],
                amount: stakedAmount,
                status: common_1.DelegationStatus.Active,
                delegationIndex: -1,
                pendingUntil: 0,
            };
        })
            .filter((item) => item !== undefined);
    }
    async getPendingOrClaimableDelegations(address, validators) {
        const creditAddresses = validators.map((validator) => validator.creditAddress);
        const pendingDelegations = await this.stakingRpcClient.getPendingUnbondDelegation(creditAddresses, address);
        const delegationsPerValidator = await Promise.all(pendingDelegations.map((result, index) => this.getDelegationsForValidator(result, validators[index], address)));
        return delegationsPerValidator
            .filter((delegation) => delegation !== undefined)
            .flat();
    }
    async getDelegationsForValidator(rawMulticallResult, validator, address) {
        const pendingCountRaw = (0, abi_1.processSingleMulticallResult)(rawMulticallResult);
        if (pendingCountRaw === undefined)
            return;
        const pendingCount = Number(pendingCountRaw);
        return await this.getUnbondDelegations(validator.creditAddress, address, pendingCount, validator);
    }
    async getUnbondDelegations(creditAddress, address, count, validator) {
        const unbondRequestPromises = Array.from({ length: count }, (_, index) => this.stakingRpcClient.getUnbondRequestData(creditAddress, address, BigInt(index)));
        const unbondRequests = await Promise.all(unbondRequestPromises);
        const now = Date.now();
        return unbondRequests.map((req, index) => {
            const unlockTimeInMillis = req.unlockTime * 1000n;
            return {
                id: `delegation_pending__${validator.creditAddress}_${index}`,
                validator,
                amount: req.amount,
                status: now > unlockTimeInMillis
                    ? common_1.DelegationStatus.Claimable
                    : common_1.DelegationStatus.Pending,
                delegationIndex: index,
                pendingUntil: now > unlockTimeInMillis ? 0 : Number(unlockTimeInMillis),
            };
        });
    }
}
exports.StakingService = StakingService;
//# sourceMappingURL=staking-service.js.map