import type { Address } from "viem";
import { parseEther } from "viem";
import type { CacheContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
import type { BNBChainValidator, BNBRpcClientContract, StakingRpcClientContract } from "../rpc";
import type { MulticallResult } from "../abi";
import { processSingleMulticallResult } from "../abi";
import type {
  Delegation,
  Delegations,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
} from "@guardian-sdk/sdk";
import { filterByStatus } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

export class StakingService implements StakingServiceContract {
  private static readonly UNBOUND_PERIOD = 604800000; // 7 days in millis
  private static readonly REDELEGATION_FEE = 0.002; // percentage
  private static readonly MIN_AMOUNT_TO_STAKE = parseEther("1.0");
  private static readonly VALIDATOR_CACHE_KEY = "bsc-validators";

  constructor(
    private readonly cache: CacheContract<string, Validator[]>,
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]> {
    return filterByStatus(await this.fetchAllValidators(), status);
  }

  // BSC does not have more than 60 validators, they can be fetched in a single call, so pagination is not needed
  // pagination support to be done in the future
  private async fetchAllValidators(): Promise<Validator[]> {
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

    const validators = bnbValidators
      .map((bnbValidator, index) => {
        const operatorAddress = parseEvmAddress(bnbValidator.operatorAddress);
        const creditAddress = contractCallValidators.get(operatorAddress);
        if (!creditAddress) {
          this.logger.warn("StakingService: validator has no credit address — skipping", {
            moniker: bnbValidator.moniker,
            operatorAddress,
          });
          return undefined;
        }
        return {
          id: `${bnbValidator.moniker}_${index}`,
          status: this.getValidatorStatus(bnbValidator),
          name: bnbValidator.moniker,
          description: bnbValidator.miningStatus,
          image: this.getValidatorImage(operatorAddress),
          apy: (bnbValidator.apy ?? 0) * 100,
          delegators: bnbValidator.delegatorCount,
          operatorAddress: operatorAddress,
          creditAddress: parseEvmAddress(creditAddress),
        };
      })
      .filter((v): v is NonNullable<typeof v> => v !== undefined);

    this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);
    this.logger.debug("StakingService: validators cached", { count: validators.length });

    return validators;
  }

  private getValidatorStatus(bnbValidator: BNBChainValidator): ValidatorStatus {
    switch (bnbValidator.status) {
      case "INACTIVE":
        return "Inactive";
      case "JAILED":
        return "Jailed";
      default:
        return "Active";
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
    const validators = await this.fetchAllValidators();
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
          status: "Active" as const,
          delegationIndex: -1n,
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
        status: now > unlockTimeInMillis ? "Claimable" : "Pending",
        delegationIndex: BigInt(index),
        pendingUntil: now > unlockTimeInMillis ? 0 : Number(unlockTimeInMillis),
      };
    });
  }
}
