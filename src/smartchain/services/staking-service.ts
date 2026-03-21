import { Address, parseEther } from "viem";
import { CacheContract } from "../../common/cache";
import {
  BNBChainValidator,
  BNBRpcClientContract,
  StakingRpcClientContract,
} from "../rpc";
import { MulticallResult, processSingleMulticallResult } from "../abi";
import {
  Delegation,
  Delegations,
  DelegationStatus,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
} from "../../common";

export class StakingService implements StakingServiceContract {
  /**
   * The duration in seconds after which unbound (unstaked) funds become claimable.
   */
  private static readonly UNBOUND_PERIOD = 604800000; // 7 days in millis

  /**
   * The fee rate applied for redelegation operations.
   */
  private static readonly REDELEGATION_FEE = 0.02;

  /**
   * The minimum amount of BNB required to initiate a new staking delegation.
   */
  private static readonly MIN_AMOUNT_TO_STAKE = parseEther("1.0");

  /**
   * Cache key for storing validator data to avoid redundant RPC calls.
   */
  private static readonly VALIDATOR_CACHE_KEY = "bsc-validators";

  /**
   * Constructs an instance of StakingService.
   * @param cache An in-memory cache instance for storing frequently accessed data like validators.
   * @param stakingRpcClient An RPC client for interacting with the staking smart contracts.
   * @param bnbRpcClient An RPC client for interacting with the BNB Chain's native RPC for validator and staking summary data.
   */
  constructor(
    private readonly cache: CacheContract<string, Validator[]>,
    private readonly stakingRpcClient: StakingRpcClientContract,
    private readonly bnbRpcClient: BNBRpcClientContract
  ) {}

  /**
   * Retrieves a list of all active and inactive validators.
   * This method first checks the cache for existing validator data. If not found,
   * it fetches validator information from both the BNB Chain's native RPC and the credit contract,
   * combines the data, and then caches it for future use.
   * @returns A promise that resolves to an array of Validator objects.
   */
  async getValidators(): Promise<Validator[]> {
    const cached = this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
    if (cached) return cached;

    const [bnbValidators, contractCallValidators] = await Promise.all([
      this.bnbRpcClient.getValidators(),
      this.stakingRpcClient.getCreditContractValidators(),
    ]);

    const validators = bnbValidators.map((bnbValidator, index) => {
      const operatorAddress = bnbValidator.operatorAddress as Address;
      return {
        id: `${bnbValidator.moniker}_${index}`,
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

  /**
   * Determines the normalized ValidatorStatus based on the raw status from BNB Chain RPC.
   * @param bnbValidator The raw BNBChainValidator object.
   * @returns The corresponding ValidatorStatus enum value.
   */
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

  /**
   * Constructs the URL for a validator's image based on their operator address.
   * @param address The operator address of the validator.
   * @returns The URL of the validator's image.
   */
  private getValidatorImage(address: Address): string {
    const BASE_VALIDATOR_IMAGE_URL =
      "https://raw.githubusercontent.com/bnb-chain/bsc-validator-directory/main/mainnet/validators/";
    const LOGO_FILE = "/logo.png";

    return `${BASE_VALIDATOR_IMAGE_URL}${address}${LOGO_FILE}`;
  }

  /**
   * Retrieves all staking delegations for a given address, including active, pending, and claimable delegations,
   * along with a summary of the overall staking protocol.
   * @param address The blockchain address of the delegator.
   * @returns A promise that resolves to a Delegations object containing a list of delegations and staking summary.
   */
  async getDelegations(address: Address): Promise<Delegations> {
    const stakingSummaryPromise = this.bnbRpcClient.getStakingSummary();
    const validators = await this.getValidators();
    const activeDelegationsPromise = this.getActiveDelegations(
      address,
      validators
    );
    const pendingDelegationsPromise = this.getPendingOrClaimableDelegations(
      address,
      validators
    );

    const [stakingSummary, activeDelegations, pendingDelegations] =
      await Promise.all([
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

  /**
   * Fetches active staking delegations for a given address.
   * This involves querying the `getPooledBNBData` method on the staking smart contract for each validator.
   * @param address The delegator's blockchain address.
   * @param validators An array of Validator objects to check for active delegations.
   * @returns A promise that resolves to an array of active Delegation objects.
   */
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

  /**
   * Fetches pending and claimable staking delegations for a given address.
   * This involves querying the `getPendingUnbondDelegation` method to get counts of pending requests,
   * and then `getUnbondRequestData` for detailed information on each request.
   * @param address The delegator's blockchain address.
   * @param validators An array of Validator objects.
   * @returns A promise that resolves to an array of pending or claimable Delegation objects.
   */
  private async getPendingOrClaimableDelegations(
    address: Address,
    validators: Validator[]
  ): Promise<Delegation[]> {
    const creditAddresses = validators.map(
      (validator) => validator.creditAddress
    );

    // Fetch pending and claimable delegation counts per validator, with indexes
    const pendingDelegations =
      await this.stakingRpcClient.getPendingUnbondDelegation(
        creditAddresses,
        address
      );

    // Fetch the current delegations for each validator that has pending delegations
    const delegationsPerValidator = await Promise.all(
      pendingDelegations.map((result, index) =>
        this.getDelegationsForValidator(result, validators[index], address)
      )
    );

    return delegationsPerValidator
      .filter(
        (delegation): delegation is Delegation[] => delegation !== undefined
      )
      .flat();
  }

  /**
   * Processes a single multicall result to determine if there are pending unbond delegations
   * for a specific validator and then fetches the details of those delegations.
   * @param rawMulticallResult The raw result from a multicall for pending unbond delegations.
   * @param validator The Validator object associated with this result.
   * @param address The delegator's blockchain address.
   * @returns A promise that resolves to an array of Delegation objects (pending or claimable) for the validator, 
   * or undefined if no pending delegations.
   */
  private async getDelegationsForValidator(
    rawMulticallResult: MulticallResult,
    validator: Validator,
    address: Address
  ): Promise<Delegation[] | undefined> {
    const pendingCountRaw = processSingleMulticallResult(rawMulticallResult);
    if (pendingCountRaw === undefined) return;

    const pendingCount = Number(pendingCountRaw);
    return await this.getUnbondDelegations(
      validator.creditAddress,
      address,
      pendingCount,
      validator
    );
  }

  /**
   * Fetches the detailed information for unbond requests for a specific validator and delegator.
   * This involves iterating through each unbond request index and calling `getUnbondRequestData`.
   * It then determines if the unbonded funds are pending or claimable.
   * @param creditAddress The credit contract address of the validator.
   * @param address The delegator's blockchain address.
   * @param count The number of unbond requests to fetch.
   * @param validator The Validator object associated with these requests.
   * @returns A promise that resolves to an array of Delegation objects with status Pending or Claimable.
   */
  private async getUnbondDelegations(
    creditAddress: Address,
    address: Address,
    count: number,
    validator: Validator
  ): Promise<Delegation[]> {
    const unbondRequestPromises = Array.from({ length: count }, (_, index) =>
      this.stakingRpcClient.getUnbondRequestData(
        creditAddress,
        address,
        BigInt(index)
      )
    );

    const unbondRequests = await Promise.all(unbondRequestPromises);
    const now = Date.now();

    return unbondRequests.map((req, index) => {
      const unlockTimeInMillis = req.unlockTime * 1000n;

      return {
        id: `delegation_pending__${validator.creditAddress}_${index}`,
        validator,
        amount: req.amount,
        status:
          now > unlockTimeInMillis
            ? DelegationStatus.Claimable
            : DelegationStatus.Pending,
        delegationIndex: index,
        pendingUntil: now > unlockTimeInMillis ? 0 : Number(unlockTimeInMillis),
      };
    });
  }
}
