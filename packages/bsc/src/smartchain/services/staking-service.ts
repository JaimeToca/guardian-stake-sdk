import type { Address } from "viem";
import { parseEther } from "viem";
import type { CacheContract, Logger } from "@guardian/sdk";
import { NoopLogger } from "@guardian/sdk";
import type { BNBChainValidator, BNBRpcClientContract, StakingRpcClientContract } from "../rpc";
import type { MulticallResult } from "../abi";
import { processSingleMulticallResult } from "../abi";
import type { Delegation, Delegations, StakingServiceContract, Validator } from "@guardian/sdk";
import { DelegationStatus, ValidatorStatus } from "@guardian/sdk";
import { parseEvmAddress } from "../validations";

export class StakingService implements StakingServiceContract {
  private static readonly UNBOUND_PERIOD = 604800000; // 7 days in millis
  private static readonly REDELEGATION_FEE = 0.02;
  private static readonly MIN_AMOUNT_TO_STAKE = parseEther("1.0");
  private static readonly VALIDATOR_CACHE_KEY = "bsc-validators";

  constructor(
    private readonly cache: CacheContract<string, Validator[]>,
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async getValidators(): Promise<Validator[]> {
    const cached = this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
    if (cached) {
      this.logger.debug("StakingService: validators cache hit", { count: cached.length });
      return cached;
    }

    this.logger.debug("StakingService: validators cache miss — fetching from RPC");
    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.stakingRpcClient.getCreditContractValidators(),
    ]);

    const validators = bnbValidators.map((bnbValidator, index) => {
      const operatorAddress = parseEvmAddress(bnbValidator.operatorAddress);
      return {
        id: `${bnbValidator.moniker}_${index}`,
        status: this.getValidatorStatus(bnbValidator),
        name: bnbValidator.moniker,
        description: bnbValidator.miningStatus,
        image: this.getValidatorImage(operatorAddress),
        apy: bnbValidator.apy * 100,
        delegators: bnbValidator.delegatorCount,
        operatorAddress: operatorAddress,
        creditAddress: parseEvmAddress(contractCallValidators.get(operatorAddress) ?? ""),
      };
    });

    this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);
    this.logger.debug("StakingService: validators cached", { count: validators.length });

    return validators;
  }

  private getValidatorStatus(bnbValidator: BNBChainValidator): ValidatorStatus {
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

  async getDelegations(address: string): Promise<Delegations> {
    const evmAddress = parseEvmAddress(address);
    const stakingSummaryPromise = this.bnbRpcClient.getStakingSummary();
    const validators = await this.getValidators();
    const activeDelegationsPromise = this.getActiveDelegations(evmAddress, validators);
    const pendingDelegationsPromise = this.getPendingOrClaimableDelegations(evmAddress, validators);

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
    const creditContractValidators = validators.map((validator) =>
      parseEvmAddress(validator.creditAddress)
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
          id: `delegation_active_${index}`,
          validator: validators[index],
          amount: stakedAmount,
          status: DelegationStatus.Active,
          delegationIndex: -1,
          pendingUntil: 0,
        };
      })
      .filter((item) => item !== undefined);
  }

  private async getPendingOrClaimableDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditAddresses = validators.map((validator) => parseEvmAddress(validator.creditAddress));

    const pendingDelegations = await this.stakingRpcClient.getPendingUnbondDelegation(
      creditAddresses,
      address
    );

    const delegationsPerValidator = await Promise.all(
      pendingDelegations.map((result, index) =>
        this.getDelegationsForValidator(result, validators[index], address)
      )
    );

    return delegationsPerValidator
      .filter((delegation): delegation is Delegation[] => delegation !== undefined)
      .flat();
  }

  private async getDelegationsForValidator(
    rawMulticallResult: MulticallResult,
    validator: Validator,
    address: Address
  ): Promise<Delegation[] | undefined> {
    const pendingCountRaw = processSingleMulticallResult(rawMulticallResult);
    if (pendingCountRaw === undefined) return;

    const pendingCount = Number(pendingCountRaw);
    return await this.getUnbondDelegations(
      parseEvmAddress(validator.creditAddress),
      address,
      pendingCount,
      validator
    );
  }

  private async getUnbondDelegations(
    creditAddress: Address,
    address: Address,
    count: number,
    validator: Validator
  ): Promise<Delegation[]> {
    const unbondRequestPromises = Array.from({ length: count }, (_, index) =>
      this.stakingRpcClient.getUnbondRequestData(creditAddress, address, BigInt(index))
    );

    const unbondRequests = await Promise.all(unbondRequestPromises);
    const now = Date.now();

    return unbondRequests.map((req, index) => {
      const unlockTimeInMillis = req.unlockTime * 1000n;

      return {
        id: `delegation_pending__${validator.creditAddress}_${index}`,
        validator,
        amount: req.amount,
        status: now > unlockTimeInMillis ? DelegationStatus.Claimable : DelegationStatus.Pending,
        delegationIndex: index,
        pendingUntil: now > unlockTimeInMillis ? 0 : Number(unlockTimeInMillis),
      };
    });
  }
}
