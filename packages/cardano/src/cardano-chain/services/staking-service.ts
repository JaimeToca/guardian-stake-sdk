import type { Logger } from "@guardian-sdk/sdk";
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
import type {
  BlockfrostNetwork,
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostProtocolParams,
} from "../rpc/blockfrost-rpc-types";

/** Epochs per year (1 epoch ≈ 5 days → 365/5 ≈ 73 epochs). */
const EPOCHS_PER_YEAR = 73;

/** Cardano has no unbonding period. */
const UNBOUND_PERIOD_MS = 0;

/** Changing pools is free in Cardano. */
const REDELEGATE_FEE_RATE = 0;

/**
 * Minimum amount to stake: 2 ADA (stake key registration deposit).
 * In practice any amount is stakeable but 2 ADA must be available for deposit.
 */
const MIN_AMOUNT_TO_STAKE = 2_000_000n;

/**
 * Pre-computed per-epoch reward context, derived from protocol params and network info.
 * Shared between getValidators and getDelegations so both use identical inputs.
 */
interface EpochContext {
  /** Total lovelace distributed to all pools this epoch (after treasury cut). */
  epochPoolsReward: number;
  /** Total lovelace actively staked across all pools. */
  totalActiveStake: number;
  /** Pledge influence factor — a0 protocol parameter. */
  a0: number;
  /** Saturation threshold as a fraction of total active stake — 1/k (n_opt). */
  z0: number;
}

/**
 * Derives the per-epoch reward context from live on-chain parameters.
 *
 * Epoch minted supply:  R       = floor(reserves × ρ)
 * Available to pools:   R_pools = R × (1 − τ)
 *
 * where ρ (rho) = monetary expansion rate and τ (tau) = treasury growth rate.
 */
function buildEpochContext(
  protocolParams: BlockfrostProtocolParams,
  networkInfo: BlockfrostNetwork
): EpochContext {
  const { rho, tau, a0, n_opt } = protocolParams;
  const reserves = Number(networkInfo.supply.reserves);
  const totalActiveStake = Number(networkInfo.stake.active);
  const epochPoolsReward = Math.floor(reserves * rho) * (1 - tau);
  return { epochPoolsReward, totalActiveStake, a0, z0: 1 / n_opt };
}

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
  rpcClient: BlockfrostRpcClientContract,
  logger: Logger = new NoopLogger()
): StakingServiceContract {
  /**
   * Estimates annualised delegator APY using the Cardano ledger reward formula
   * (Shelley ledger spec §11.8 — Reward Calculation).
   *
   * Pool reward per epoch:
   *   R* = R_pools / (1 + a0) × [ σ' + s'×a0×(σ' − s'×(z0 − σ')/z0) / z0 ]
   *
   * Delegator APY:
   *   APY = max(0, R* − fixed_cost) × (1 − margin) / active_stake × epochs_per_year × 100
   *
   * Variables:
   *   R_pools — lovelace to all pools this epoch  (reserves×ρ after treasury τ)
   *   a0      — pledge influence factor            (protocol param, currently ~0.3)
   *   k       — desired pool count / n_opt         (protocol param, currently 500)
   *   z0      — 1/k, saturation threshold as fraction of total active stake
   *   σ'      — min(pool_stake / total_stake, z0)  capped stake fraction
   *   s'      — min(pledge / total_stake, z0)       capped pledge fraction
   *
   * The formula naturally penalises over-saturated pools (σ capped at z0),
   * high margin/fixed cost, and low pledge relative to stake (a0 term contributes less).
   */
  function estimateApy(pool: BlockfrostPoolExtended, ctx: EpochContext): number {
    const { epochPoolsReward, totalActiveStake, a0, z0 } = ctx;
    const activeStake = Number(pool.active_stake);
    const pledge = Number(pool.declared_pledge);
    const fixedCost = Number(pool.fixed_cost);

    if (activeStake <= 0 || totalActiveStake <= 0 || epochPoolsReward <= 0) return 0;

    const sigmaPrime = Math.min(activeStake / totalActiveStake, z0);
    const sPrime = Math.min(pledge / totalActiveStake, z0);

    // Pledge contribution term (reduces reward when pledge is low relative to stake)
    const innerTerm = sigmaPrime - sPrime * ((z0 - sigmaPrime) / z0);
    const poolShare = sigmaPrime + sPrime * a0 * (innerTerm / z0);

    const poolReward = (epochPoolsReward / (1 + a0)) * poolShare;
    const delegatorReward = Math.max(0, poolReward - fixedCost) * (1 - pool.margin_cost);

    return Math.max(0, (delegatorReward / activeStake) * EPOCHS_PER_YEAR * 100);
  }

  function toValidator(
    pool: BlockfrostPoolExtended,
    metadata: BlockfrostPoolMetadata | null,
    ctx: EpochContext
  ): Validator {
    const isRetiring = (pool.retirement?.length ?? 0) > 0;
    const status: ValidatorStatus = isRetiring ? "Inactive" : "Active";

    return {
      id: pool.pool_id,
      status,
      name: metadata?.name ?? metadata?.ticker ?? pool.pool_id.slice(0, 16) + "...",
      description: metadata?.description ?? "",
      image: undefined, // Cardano pools don't have standardised logo URLs
      apy: estimateApy(pool, ctx),
      delegators: pool.live_delegators,
      operatorAddress: pool.pool_id, // bech32 pool ID
      creditAddress: pool.pool_id, // no separate credit contract in Cardano
    };
  }

  return {
    /**
     * Returns one page of validators, fetching exactly that page from Blockfrost.
     * Pagination is passed through directly — no full list is ever loaded into memory.
     * `total` and `totalPages` are not available without fetching all pages, so they
     * are omitted (undefined). Use `hasNextPage` to drive forward navigation.
     */
    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
      validatePageParams(params ?? {});
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? 20;

      const [pools, protocolParams, networkInfo] = await Promise.all([
        rpcClient.getPools(page, pageSize),
        rpcClient.getProtocolParams(),
        rpcClient.getNetwork(),
      ]);

      const ctx = buildEpochContext(protocolParams, networkInfo);

      // Fetch metadata only for the pools on this page
      const metadataResults = await Promise.allSettled(
        pools.map((pool) => rpcClient.getPoolMetadata(pool.pool_id))
      );

      const data: Validator[] = pools.map((pool, index) => {
        const metaResult = metadataResults[index];
        const metadata: BlockfrostPoolMetadata | null =
          metaResult.status === "fulfilled" ? metaResult.value : null;
        return toValidator(pool, metadata, ctx);
      });

      logger.debug("StakingService: validator page fetched", {
        page,
        pageSize,
        count: data.length,
      });

      return {
        data,
        pagination: {
          page,
          pageSize,
          total: undefined,
          totalPages: undefined,
          hasNextPage: pools.length === pageSize,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      const [account, networkInfo, pools, protocolParams] = await Promise.all([
        rpcClient.getAccount(resolveStakeAddress(address)),
        rpcClient.getNetwork(),
        rpcClient.getPools(), // first page only — used for maxApy approximation
        rpcClient.getProtocolParams(),
      ]);

      const ctx = buildEpochContext(protocolParams, networkInfo);
      const delegations: Delegation[] = [];

      if (account.active && account.pool_id) {
        const [pool, metadata] = await Promise.all([
          rpcClient.getPool(account.pool_id),
          rpcClient.getPoolMetadata(account.pool_id),
        ]);

        delegations.push({
          id: `delegation_active_${account.pool_id}`,
          validator: toValidator(pool, metadata, ctx),
          amount: BigInt(account.controlled_amount),
          status: "Active",
          delegationIndex: 0n, // Not applicable in Cardano
          pendingUntil: 0, // No unbonding period
        });
      }

      const totalStake = BigInt(networkInfo.stake.live);
      const maxApy =
        pools.length > 0 ? pools.reduce((max, p) => Math.max(max, estimateApy(p, ctx)), 0) : 0;

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
