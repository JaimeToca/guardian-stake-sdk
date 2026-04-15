import type { CacheContract, Logger } from "@guardian-sdk/sdk";
import { filterByStatus, NoopLogger } from "@guardian-sdk/sdk";
import type {
  Delegation,
  Delegations,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
} from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import { resolveStakeAddress } from "../validations";
import type { BlockfrostPoolExtended, BlockfrostPoolMetadata } from "../rpc/blockfrost-rpc-types";

/**
 * Cardano staking service.
 *
 * - Delegation does NOT lock tokens. All ADA in the wallet earns rewards passively.
 * - There is no unbonding period — you can switch pools or stop delegating any time.
 * - Rewards accumulate every epoch (~5 days) and must be explicitly withdrawn.
 * - A 2 ADA deposit is required when registering a stake key for the first time
 *   (returned when deregistering).
 */
export class StakingService implements StakingServiceContract {
  /** Epochs per year (1 epoch ≈ 5 days → 365/5 ≈ 73 epochs). */
  private static readonly EPOCHS_PER_YEAR = 73;

  /** Cardano's approximate annual protocol staking yield. */
  private static readonly BASE_PROTOCOL_RATE = 4.5;

  /** Cardano has no unbonding period. */
  private static readonly UNBOUND_PERIOD_MS = 0;

  /** Changing pools is free in Cardano. */
  private static readonly REDELEGATE_FEE_RATE = 0;

  /**
   * Minimum amount to stake: 2 ADA (stake key registration deposit).
   * In practice any amount is stakeable but 2 ADA must be available for deposit.
   */
  private static readonly MIN_AMOUNT_TO_STAKE = 2_000_000n;

  private static readonly VALIDATOR_CACHE_KEY = "cardano-validators";

  constructor(
    private readonly cache: CacheContract<string, Validator[]>,
    private readonly rpcClient: BlockfrostRpcClientContract,
    private readonly logger: Logger = new NoopLogger()
  ) {}

  async getValidators(status?: ValidatorStatus | ValidatorStatus[]): Promise<Validator[]> {
    return filterByStatus(await this.fetchAllValidators(), status);
  }

  private async fetchAllValidators(): Promise<Validator[]> {
    const cached = this.cache.get(StakingService.VALIDATOR_CACHE_KEY);
    if (cached) {
      this.logger.debug("StakingService: validators cache hit", { count: cached.length });
      return cached;
    }

    this.logger.debug("StakingService: validators cache miss — fetching from Blockfrost");

    const pools = await this.rpcClient.getPools();

    // Batch-fetch metadata for all pools in parallel
    const metadataResults = await Promise.allSettled(
      pools.map((pool) => this.rpcClient.getPoolMetadata(pool.pool_id))
    );

    const validators: Validator[] = pools.map((pool, index) => {
      const metaResult = metadataResults[index];
      const metadata: BlockfrostPoolMetadata | null =
        metaResult.status === "fulfilled" ? metaResult.value : null;

      return this.toValidator(pool, metadata);
    });

    this.cache.set(StakingService.VALIDATOR_CACHE_KEY, validators);
    this.logger.debug("StakingService: validators cached", { count: validators.length });

    return validators;
  }

  private toValidator(
    pool: BlockfrostPoolExtended,
    metadata: BlockfrostPoolMetadata | null
  ): Validator {
    const estimatedApy = this.estimateApy(pool);
    const isRetiring = (pool.retirement?.length ?? 0) > 0;
    const status: ValidatorStatus = isRetiring ? "Inactive" : "Active";

    return {
      id: pool.pool_id,
      status,
      name: metadata?.name ?? metadata?.ticker ?? pool.pool_id.slice(0, 16) + "...",
      description: metadata?.description ?? "",
      image: undefined, // Cardano pools don't have standardised logo URLs
      apy: estimatedApy,
      delegators: pool.live_delegators,
      operatorAddress: pool.pool_id, // bech32 pool ID
      creditAddress: pool.pool_id, // no separate credit contract in Cardano
    };
  }

  /**
   * Estimates annual percentage yield for a pool.
   *
   * Formula: (1 - margin) × baseProtocolRate × (1 - fixedCostFraction)
   * where baseProtocolRate ≈ 4.5% (Cardano's approximate annual staking yield).
   * This is a rough estimate — actual ROA depends on pool performance and saturation.
   */
  private estimateApy(pool: BlockfrostPoolExtended): number {
    // Oversaturated pools earn less rewards
    const saturationPenalty = pool.live_saturation > 1 ? 1 / pool.live_saturation : 1;

    // Fixed cost fraction (lower is better for delegators)
    const activeStake = BigInt(pool.active_stake);
    const fixedCost = BigInt(pool.fixed_cost);
    const epochRewards =
      (activeStake * BigInt(Math.round(StakingService.BASE_PROTOCOL_RATE * 100))) /
      10000n /
      BigInt(StakingService.EPOCHS_PER_YEAR);
    const fixedCostFraction = epochRewards > 0n ? Number(fixedCost) / Number(epochRewards) : 0;

    const estimatedApy =
      StakingService.BASE_PROTOCOL_RATE *
      (1 - pool.margin_cost) *
      saturationPenalty *
      Math.max(0, 1 - fixedCostFraction);

    return Math.max(0, estimatedApy);
  }

  async getDelegations(address: string): Promise<Delegations> {
    const [account, networkInfo, pools] = await Promise.all([
      this.rpcClient.getAccount(resolveStakeAddress(address)),
      this.rpcClient.getNetwork(),
      this.rpcClient.getPools(),
    ]);

    const delegations: Delegation[] = [];

    if (account.active && account.pool_id) {
      const [pool, metadata] = await Promise.all([
        this.rpcClient.getPool(account.pool_id),
        this.rpcClient.getPoolMetadata(account.pool_id),
      ]);

      delegations.push({
        id: `delegation_active_${account.pool_id}`,
        validator: this.toValidator(pool, metadata),
        amount: BigInt(account.controlled_amount),
        status: "Active",
        delegationIndex: 0n, // Not applicable in Cardano
        pendingUntil: 0, // No unbonding period
      });
    }

    const totalStake = BigInt(networkInfo.stake.live);
    const maxApy = pools.length > 0
      ? pools.reduce((max, p) => Math.max(max, this.estimateApy(p)), 0)
      : StakingService.BASE_PROTOCOL_RATE;

    return {
      delegations,
      stakingSummary: {
        totalProtocolStake: Number(totalStake / 1_000_000n), // convert to ADA
        maxApy,
        minAmountToStake: StakingService.MIN_AMOUNT_TO_STAKE,
        unboundPeriodInMillis: StakingService.UNBOUND_PERIOD_MS,
        redelegateFeeRate: StakingService.REDELEGATE_FEE_RATE,
        activeValidators: undefined,
        totalValidators: undefined,
      },
    };
  }

  /** Creates a placeholder validator object for a pool not in the cached list. */
  private makeUnknownValidator(poolId: string): Validator {
    return {
      id: poolId,
      status: "Active",
      name: poolId.slice(0, 16) + "...",
      description: "",
      image: undefined,
      apy: 0,
      delegators: 0,
      operatorAddress: poolId,
      creditAddress: poolId,
    };
  }
}
