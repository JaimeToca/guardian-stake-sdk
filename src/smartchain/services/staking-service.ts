import { Address, Hex, parseEther } from "viem";
import { StakingRpcClientContract } from "../rpc/staking-rpc-client-contract";
import {
  Delegation,
  Delegations,
  DelegationStatus,
  Validator,
  ValidatorStatus,
} from "./staking-types";
import { StakingServiceContract } from "./staking-service-contract";
import { InMemoryCache } from "../cache/in-memory-cache";
import { processSingleMulticallResult } from "../abi/abi-utils";

export class StakingService implements StakingServiceContract {
  private static readonly UNBOUND_PERIOD = 604800;
  private static readonly REDELEGATION_FEE = 0.02;
  private static readonly MIN_AMOUNT_TO_STAKE = parseEther("1.0");
  private static readonly VALIDATOR_CACHE_KEY = "bsc-validators";

  constructor(
    private readonly cache: InMemoryCache<string, Validator[]>,
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract
  ) {}

  async getValidators(): Promise<Validator[]> {
    if (this.cache.has(StakingService.VALIDATOR_CACHE_KEY)) {
      return this.cache.get(StakingService.VALIDATOR_CACHE_KEY) as Validator[];
    }

    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.stakingRpcClient.getCreditContractValidators(),
    ]);

    const validators = bnbValidators.map((bnbValidator, index) => {
      const operatorAddress = bnbValidator.operatorAddress as Address;
      return {
        id: `$${bnbValidator.moniker}_${index}`,
        status: this.getValidatorStatus(bnbValidator),
        name: bnbValidator.moniker,
        description: bnbValidator.miningStatus,
        image: this.getValidatorImage(operatorAddress),
        apy: bnbValidator.apy * 100,
        delegators: bnbValidator.delegatorCount,
        operatorAddress: operatorAddress,
        creditAddress: contractCallValidators.get(operatorAddress) as Address,
      };
    });
    
    this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);

    return validators;
  }

  private getValidatorStatus(bnbValidator: BNBChainValidator) {
    switch (bnbValidator.status) {
      case "INACTIVE":
        return ValidatorStatus.Inactive;
      case "JAILED":
        return ValidatorStatus.Jailed;
      default:
        return ValidatorStatus.Active;
    }
  }

  private getValidatorImage(address: Address): string {
    const BASE_VALIDATOR_IMAGE_URL =
      "https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/";
    const LOGO_FILE = "/logo.png";

    return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
  }

  async getDelegations(address: Address): Promise<Delegations> {
    const stakingSummaryPromise = this.bnbRpcClient.getStakingSummary();
    const validators = await this.getValidators();
    const activeDelegationsPromise = this.getActiveDelegations(
      address,
      validators
    );
    const pendingDelegationsPromise = this.getPendingOrClaimbleDelegations(
      address,
      validators
    )

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

  private async getActiveDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditContractValidators = validators.map(
      (validator) => validator.creditAddress
    );

    const pooledBNBData = await this.stakingRpcClient.getPooledBNBData(
      creditContractValidators,
      address
    );

    return pooledBNBData
      .map((data, index) => {
        const stakedAmount = processSingleMulticallResult(data);
        if (stakedAmount === undefined) {
          return undefined;
        }

        return {
          id: `delegation_${index}`,
          validator: validators[index],
          amount: stakedAmount,
          status: DelegationStatus.Active,
          pendingUntil: 0,
        };
      })
      .filter((item) => item !== undefined);
  }

  private async getPendingOrClaimbleDelegations(
    address: Address,
    validators: Validator[]
  ) {
    const creditContractValidators = validators.map(
      (validator) => validator.creditAddress
    );

    const pendingUnbondDelegations =
      await this.stakingRpcClient.getPendingUnbondDelegation(
        creditContractValidators,
        address
      );

    return pendingUnbondDelegations
      .map((data, index) => {
        const pendingRequestsResponse = processSingleMulticallResult(data);
        if (pendingRequestsResponse === undefined) {
          return undefined;
        }
        const validator = validators[index];
        const maxPendingRequests = Number(pendingRequestsResponse);
        
        for (
          let requestIndex: number = 0;
          requestIndex < maxPendingRequests;
          requestIndex++
        ) {
          const validatorCreditAddress = validator.creditAddress;
          this.stakingRpcClient.getUnbondRequestData(
            address,
            BigInt(requestIndex)
          );
          // Build Delegation
          //
        }
      })
      .filter((item) => item !== undefined);
  }
}
