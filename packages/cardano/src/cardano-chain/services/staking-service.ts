import type { CacheContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger, validatePageParams } from "@guardian-sdk/sdk";
import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  StakingServiceContract,
  Validator,
  ValidatorStatus,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import { resolveStakeAddress } from "../validations";
import type { BlockfrostPoolExtended, BlockfrostPoolMetadata } from "../rpc/blockfrost-rpc-types";

/** Epochs per year (1 epoch ≈ 5 days → 365/5 ≈ 73 epochs). */
const EPOCHS_PER_YEAR = 73;

/** Cardano's approximate annual protocol staking yield. */
const BASE_PROTOCOL_RATE = 4.5;

/** Cardano has no unbonding period. */
const UNBOUND_PERIOD_MS = 0;

/** Changing pools is free in Cardano. */
const REDELEGATE_FEE_RATE = 0;

/**
 * Minimum amount to stake: 2 ADA (stake key registration deposit).
 * In practice any amount is stakeable but 2 ADA must be available for deposit.
 */
const MIN_AMOUNT_TO_STAKE = 2_000_000n;

const VALIDATOR_CACHE_KEY = "cardano-validators";

/**
 * Cardano staking service.
 *
 * - Delegation does NOT lock tokens. All ADA in the wallet earns rewards passively.
 * - There is no unbonding period — you can switch pools or stop delegating any time.
 * - Rewards accumulate every epoch (~5 days) and must be explicitly withdrawn.
 * - A 2 ADA deposit is required when registering a stake key for the first time
 *   (returned when deregistering).
 */
export function createStakingService(
  cache: CacheContract<string, Validator[]>,
  rpcClient: BlockfrostRpcClientContract,
  logger: Logger = new NoopLogger()
): StakingServiceContract {
  function estimateApy(pool: BlockfrostPoolExtended): number {
    // Oversaturated pools earn less rewards
    const saturationPenalty = pool.live_saturation > 1 ? 1 / pool.live_saturation : 1;

    // Fixed cost fraction (lower is better for delegators)
    const activeStake = BigInt(pool.active_stake);
    const fixedCost = BigInt(pool.fixed_cost);
    const epochRewards =
      (activeStake * BigInt(Math.round(BASE_PROTOCOL_RATE * 100))) /
      10000n /
      BigInt(EPOCHS_PER_YEAR);
    const fixedCostFraction = epochRewards > 0n ? Number(fixedCost) / Number(epochRewards) : 0;

    const estimatedApy =
      BASE_PROTOCOL_RATE *
      (1 - pool.margin_cost) *
      saturationPenalty *
      Math.max(0, 1 - fixedCostFraction);

    return Math.max(0, estimatedApy);
  }

  function toValidator(
    pool: BlockfrostPoolExtended,
    metadata: BlockfrostPoolMetadata | null
  ): Validator {
    const isRetiring = (pool.retirement?.length ?? 0) > 0;
    const status: ValidatorStatus = isRetiring ? "Inactive" : "Active";

    return {
      id: pool.pool_id,
      status,
      name: metadata?.name ?? metadata?.ticker ?? pool.pool_id.slice(0, 16) + "...",
      description: metadata?.description ?? "",
      image: undefined, // Cardano pools don't have standardised logo URLs
      apy: estimateApy(pool),
      delegators: pool.live_delegators,
      operatorAddress: pool.pool_id, // bech32 pool ID
      creditAddress: pool.pool_id, // no separate credit contract in Cardano
    };
  }

  async function fetchAllValidators(): Promise<Validator[]> {
    const cached = cache.get(VALIDATOR_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: validators cache hit", { count: cached.length });
      return cached;
    }

    logger.debug("StakingService: validators cache miss — fetching from Blockfrost");

    const pools = await rpcClient.getPools();

    // Batch-fetch metadata for all pools in parallel
    const metadataResults = await Promise.allSettled(
      pools.map((pool) => rpcClient.getPoolMetadata(pool.pool_id))
    );

    const validators: Validator[] = pools.map((pool, index) => {
      const metaResult = metadataResults[index];
      const metadata: BlockfrostPoolMetadata | null =
        metaResult.status === "fulfilled" ? metaResult.value : null;
      return toValidator(pool, metadata);
    });

    cache.set(VALIDATOR_CACHE_KEY, validators);
    logger.debug("StakingService: validators cached", { count: validators.length });

    return validators;
  }

  return {
    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
      validatePageParams(params ?? {});
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 100;

      const all = await fetchAllValidators();
      const start = (page - 1) * pageSize;
      return {
        data: all.slice(start, start + pageSize),
        pagination: {
          page,
          pageSize,
          total: all.length,
          totalPages: Math.ceil(all.length / pageSize),
          hasNextPage: page * pageSize < all.length,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      const [account, networkInfo, pools] = await Promise.all([
        rpcClient.getAccount(resolveStakeAddress(address)),
        rpcClient.getNetwork(),
        rpcClient.getPools(),
      ]);

      const delegations: Delegation[] = [];

      if (account.active && account.pool_id) {
        const [pool, metadata] = await Promise.all([
          rpcClient.getPool(account.pool_id),
          rpcClient.getPoolMetadata(account.pool_id),
        ]);

        delegations.push({
          id: `delegation_active_${account.pool_id}`,
          validator: toValidator(pool, metadata),
          amount: BigInt(account.controlled_amount),
          status: "Active",
          delegationIndex: 0n, // Not applicable in Cardano
          pendingUntil: 0, // No unbonding period
        });
      }

      const totalStake = BigInt(networkInfo.stake.live);
      const maxApy =
        pools.length > 0
          ? pools.reduce((max, p) => Math.max(max, estimateApy(p)), 0)
          : BASE_PROTOCOL_RATE;

      return {
        delegations,
        stakingSummary: {
          totalProtocolStake: Number(totalStake / 1_000_000n), // convert to ADA
          maxApy,
          minAmountToStake: MIN_AMOUNT_TO_STAKE,
          unboundPeriodInMillis: UNBOUND_PERIOD_MS,
          redelegateFeeRate: REDELEGATE_FEE_RATE,
          activeValidators: undefined,
          totalValidators: undefined,
        },
      };
    },
  };
}
