"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingService = void 0;
const viem_1 = require("viem");
const staking_types_1 = require("./staking-types");
const abi_utils_1 = require("../abi/abi-utils");
class StakingService {
    constructor(cache, stakingRpcClient, bnbRpcClient) {
        this.cache = cache;
        this.stakingRpcClient = stakingRpcClient;
        this.bnbRpcClient = bnbRpcClient;
    }
    async getValidators() {
        if (this.cache.has(StakingService.VALIDATOR_CACHE_KEY)) {
            return this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
        }
        const [bnbValidators, contractCallValidators] = await Promise.all([
            this.bnbRpcClient.getValidators(),
            this.stakingRpcClient.getCreditContractValidators(),
        ]);
        const validators = bnbValidators.map((bnbValidator, index) => {
            const operatorAddress = bnbValidator.operatorAddress;
            return {
                id: `$${bnbValidator.moniker}_${index}`,
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
                return staking_types_1.ValidatorStatus.Inactive;
            case "JAILED":
                return staking_types_1.ValidatorStatus.Jailed;
            default:
                return staking_types_1.ValidatorStatus.Active;
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
        const pendingDelegationsPromise = this.getPendingOrClaimbleDelegations(address, validators);
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
            const stakedAmount = (0, abi_utils_1.processSingleMulticallResult)(data);
            if (stakedAmount === undefined) {
                return undefined;
            }
            return {
                id: `delegation_active_${index}`,
                validator: validators[index],
                amount: stakedAmount,
                status: staking_types_1.DelegationStatus.Active,
                delegationIndex: -1,
                pendingUntil: 0,
            };
        })
            .filter((item) => item !== undefined);
    }
    async getPendingOrClaimbleDelegations(address, validators) {
        const creditContractValidators = validators.map((validator) => validator.creditAddress);
        const pendingUnbondDelegations = await this.stakingRpcClient.getPendingUnbondDelegation(creditContractValidators, address);
        const delegationPromiseResults = pendingUnbondDelegations.map(async (data, index) => {
            const pendingRequestsResponse = (0, abi_utils_1.processSingleMulticallResult)(data);
            if (pendingRequestsResponse === undefined) {
                return undefined;
            }
            const validator = validators[index];
            const maxPendingRequests = Number(pendingRequestsResponse);
            const unbondRequests = await this.getUnbondRequests(validator.creditAddress, address, maxPendingRequests);
            return this.mapUnbondRequestsToDelegations(unbondRequests, validator, index);
        }).filter(delegation => delegation !== undefined);
        const resolvedDelegationArrays = await Promise.all(delegationPromiseResults);
        return resolvedDelegationArrays
            .filter((item) => item !== undefined)
            .flat();
    }
    async getUnbondRequests(creditContract, address, maxPendingRequests) {
        const unbondRequestsPromises = Array.from({ length: maxPendingRequests }, (_, requestIndex) => this.stakingRpcClient.getUnbondRequestData(creditContract, address, BigInt(requestIndex)));
        return Promise.all(unbondRequestsPromises);
    }
    mapUnbondRequestsToDelegations(unbondRequests, validator, delegationIndex) {
        const currentTime = Date.now();
        return unbondRequests.map((unbondRequest, unbondRequestIndex) => {
            const unlockTime = unbondRequest.unlockTime;
            const isClaimable = currentTime > unlockTime;
            return {
                id: `delegation_pending__${delegationIndex}`,
                validator,
                amount: unbondRequest.amount,
                status: isClaimable
                    ? staking_types_1.DelegationStatus.Claimable
                    : staking_types_1.DelegationStatus.Pending,
                delegationIndex: unbondRequestIndex,
                pendingUntil: isClaimable ? 0 : Number(unlockTime),
            };
        });
    }
}
exports.StakingService = StakingService;
StakingService.UNBOUND_PERIOD = 604800;
StakingService.REDELEGATION_FEE = 0.02;
StakingService.MIN_AMOUNT_TO_STAKE = (0, viem_1.parseEther)("1.0");
StakingService.VALIDATOR_CACHE_KEY = "bsc-validators";
//# sourceMappingURL=staking-service.js.map