import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  Logger,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import { createInMemoryCache, NoopLogger, validatePageParams } from "@guardian-sdk/sdk";
import type { SolanaRpcClientContract } from "../rpc/solana-rpc-client-contract";
import type { VoteAccountInfo, VoteAccountsResult } from "../rpc/solana-rpc-types";
import type { StakePosition } from "../state/stake-account";
import type { StakePositionCache } from "../state/stake-cache";
import { computeStakingApy } from "../state/apr";
import { SLOTS_PER_YEAR } from "../state/constants";
import { loadPositions, type LoadPositionsConfig } from "./load-positions";

/** Default page size for `getValidators` (1-based pagination). */
const DEFAULT_PAGE_SIZE = 20;

/** Default validators list cache TTL (3 minutes). */
const DEFAULT_VALIDATORS_CACHE_TTL_MS = 180_000;

/**
 * Approximate mainnet slot duration (ms). Used for epoch-boundary ETA and
 * `unboundPeriodInMillis` (document as approximate).
 */
const DEFAULT_SLOT_MS = 400;

const VALIDATORS_CACHE_KEY = "vote-accounts";

export interface SolanaStakingServiceConfig extends LoadPositionsConfig {
  validatorsCacheTtlMs?: number;
}

/**
 * Placeholder when a position has no voter (inactive / claimable / initialized-only).
 * Always non-null so consumers never null-check `delegation.validator`.
 */
export function inactiveStakeValidator(): Validator {
  return {
    id: "solana-stake-inactive",
    status: "Inactive",
    name: "Inactive stake",
    description: "",
    image: undefined,
    apy: 0,
    delegators: undefined,
    operatorAddress: "",
    creditAddress: "",
  };
}

function buildValidator(
  fields: Pick<Validator, "id" | "status" | "name"> & Partial<Validator>
): Validator {
  return {
    description: "",
    image: undefined,
    apy: 0,
    delegators: undefined,
    operatorAddress: "",
    creditAddress: "",
    ...fields,
  };
}

/** Vote account not in current `getVoteAccounts` result (delisted / unknown). */
function unknownVoteValidator(votePubkey: string): Validator {
  return buildValidator({
    id: votePubkey,
    status: "Inactive",
    name: votePubkey,
    description: "Vote account not in current validator set",
    operatorAddress: votePubkey,
  });
}

/** Network-wide inputs for the issuance-APY estimate (per cache load). */
interface ApyInputs {
  inflationValidatorRate: number;
  stakedFraction: number;
  epochsPerYear: number;
}

/** Combined validators + APY inputs cached under one key. `apy` is undefined when degraded. */
interface ValidatorInputs {
  voteAccounts: VoteAccountsResult;
  apy: ApyInputs | undefined;
}

function computeValidatorApy(
  vote: VoteAccountInfo,
  status: "Active" | "Inactive",
  apy: ApyInputs | undefined
): number {
  if (status !== "Active" || !apy) return 0;
  return computeStakingApy({
    inflationValidatorRate: apy.inflationValidatorRate,
    stakedFraction: apy.stakedFraction,
    epochsPerYear: apy.epochsPerYear,
    commissionPercent: vote.commission,
  });
}

function mapVoteToValidator(
  vote: VoteAccountInfo,
  status: "Active" | "Inactive",
  apy: ApyInputs | undefined
): Validator {
  return buildValidator({
    id: vote.votePubkey,
    status,
    name: vote.votePubkey,
    operatorAddress: vote.votePubkey,
    apy: computeValidatorApy(vote, status, apy),
  });
}

/**
 * Map activation-derived status → SDK `DelegationStatus`.
 * Activating folds into Active (v1 — no new status).
 */
export function mapPositionStatus(
  status: StakePosition["status"]
): "Active" | "Pending" | "Claimable" {
  switch (status) {
    case "active":
    case "activating":
      return "Active";
    case "deactivating":
      return "Pending";
    case "inactive":
      return "Claimable";
  }
}

/**
 * Actionable amount for a position (design §9):
 * - Active/activating: effective + activating (delegated weight still warming up counts as staked)
 * - Pending/deactivating: deactivating amount
 * - Claimable/inactive: full account lamports (withdrawable when fully inactive)
 */
export function positionAmount(position: StakePosition): bigint {
  switch (position.status) {
    case "active":
    case "activating":
      return position.effective + position.activating > 0n
        ? position.effective + position.activating
        : position.delegatedStake;
    case "deactivating":
      return position.deactivating > 0n ? position.deactivating : position.effective;
    case "inactive":
      return position.lamports;
  }
}

function estimateEpochBoundaryMs(
  slotIndex: bigint,
  slotsInEpoch: bigint,
  nowMs: number = Date.now()
): number {
  if (slotsInEpoch <= 0n) return nowMs;
  const remaining = slotsInEpoch > slotIndex ? slotsInEpoch - slotIndex : 0n;
  return nowMs + Number(remaining) * DEFAULT_SLOT_MS;
}

function estimateUnboundPeriodMs(slotsInEpoch: bigint): number {
  if (slotsInEpoch <= 0n) {
    // ~2 days fallback (approx mainnet epoch).
    return 2 * 24 * 60 * 60 * 1000;
  }
  return Number(slotsInEpoch) * DEFAULT_SLOT_MS;
}

export function createStakingService(
  rpc: SolanaRpcClientContract,
  cache: StakePositionCache,
  config: SolanaStakingServiceConfig = {},
  logger: Logger = new NoopLogger()
) {
  const validatorsTtl = config.validatorsCacheTtlMs ?? DEFAULT_VALIDATORS_CACHE_TTL_MS;
  const voteCache = createInMemoryCache<string, ValidatorInputs>(validatorsTtl);

  async function loadValidatorInputs(): Promise<ValidatorInputs> {
    const cached = voteCache.get(VALIDATORS_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: validator inputs cache hit", {
        current: cached.voteAccounts.current.length,
        delinquent: cached.voteAccounts.delinquent.length,
        apy: cached.apy !== undefined,
      });
      return cached;
    }
    logger.debug("StakingService: validator inputs cache miss — fetching");
    const voteAccounts = await rpc.getVoteAccounts();
    const apy = await loadApyInputs(voteAccounts);
    const result: ValidatorInputs = { voteAccounts, apy };
    voteCache.set(VALIDATORS_CACHE_KEY, result, validatorsTtl);
    return result;
  }

  async function loadApyInputs(voteAccounts: VoteAccountsResult): Promise<ApyInputs | undefined> {
    try {
      const [inflation, supply, epochInfo] = await Promise.all([
        rpc.getInflationRate(),
        rpc.getSupply(),
        rpc.getEpochInfo(),
      ]);
      const totalActivatedStake = [...voteAccounts.current, ...voteAccounts.delinquent].reduce(
        (sum, v) => sum + v.activatedStake,
        0n
      );
      const stakedFraction = Number(totalActivatedStake) / Number(supply.total);
      const epochsPerYear =
        epochInfo.slotsInEpoch > 0n ? SLOTS_PER_YEAR / Number(epochInfo.slotsInEpoch) : 1;
      return {
        inflationValidatorRate: inflation.validator,
        stakedFraction,
        epochsPerYear,
      };
    } catch (err) {
      logger.warn("StakingService: APY inputs unavailable — reporting apy 0", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  function validatorMap(inputs: ValidatorInputs): Map<string, Validator> {
    const map = new Map<string, Validator>();
    for (const v of inputs.voteAccounts.current) {
      map.set(v.votePubkey, mapVoteToValidator(v, "Active", inputs.apy));
    }
    for (const v of inputs.voteAccounts.delinquent) {
      if (!map.has(v.votePubkey)) {
        map.set(v.votePubkey, mapVoteToValidator(v, "Inactive", inputs.apy));
      }
    }
    return map;
  }

  function computeMaxApy(current: VoteAccountInfo[], apy: ApyInputs | undefined): number {
    if (!apy || current.length === 0) return 0;
    const minCommission = current.reduce(
      (min, v) => (v.commission < min ? v.commission : min),
      100
    );
    return computeStakingApy({
      inflationValidatorRate: apy.inflationValidatorRate,
      stakedFraction: apy.stakedFraction,
      epochsPerYear: apy.epochsPerYear,
      commissionPercent: minCommission,
    });
  }

  function resolveValidator(position: StakePosition, byVote: Map<string, Validator>): Validator {
    if (!position.voter) {
      return inactiveStakeValidator();
    }
    return byVote.get(position.voter) ?? unknownVoteValidator(position.voter);
  }

  return {
    async getValidators(params: GetValidatorsParams = {}): Promise<ValidatorsPage> {
      validatePageParams(params);
      const page = params.page ?? 1;
      const pageSize = params.pageSize ?? DEFAULT_PAGE_SIZE;

      const inputs = await loadValidatorInputs();
      const votes = inputs.voteAccounts;
      const all: Validator[] = [
        ...votes.current.map((v) => mapVoteToValidator(v, "Active", inputs.apy)),
        ...votes.delinquent.map((v) => mapVoteToValidator(v, "Inactive", inputs.apy)),
      ];

      const start = (page - 1) * pageSize;
      const data = all.slice(start, start + pageSize);
      const total = all.length;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));

      return {
        data,
        pagination: {
          page,
          pageSize,
          total,
          totalPages,
          hasNextPage: start + pageSize < total,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      logger.debug("StakingService: getDelegations", { address });

      const [positions, inputs, minDelegation, epochInfo] = await Promise.all([
        loadPositions({ rpc, cache, config, logger }, address),
        loadValidatorInputs(),
        rpc.getStakeMinimumDelegation(),
        rpc.getEpochInfo(),
      ]);
      const votes = inputs.voteAccounts;
      const byVote = validatorMap(inputs);
      const nowMs = Date.now();
      const epochBoundaryMs = estimateEpochBoundaryMs(
        epochInfo.slotIndex,
        epochInfo.slotsInEpoch,
        nowMs
      );

      const delegations: Delegation[] = [];
      for (const position of positions) {
        const status = mapPositionStatus(position.status);
        const amount = positionAmount(position);
        // Drop zero-weight positions (loadPositions already omits closed/zero-lamport accounts).
        if (amount === 0n) continue;

        delegations.push({
          id: position.stakeAccount,
          validator: resolveValidator(position, byVote),
          amount,
          status,
          // Seed index when known; -1 for GPA-discovered accounts so they don't alias seed 0.
          delegationIndex: BigInt(position.seedIndex ?? -1),
          pendingUntil: status === "Pending" ? epochBoundaryMs : 0,
        });
      }

      const totalProtocolStake = [...votes.current, ...votes.delinquent].reduce(
        (sum, v) => sum + Number(v.activatedStake),
        0
      );

      return {
        delegations,
        stakingSummary: {
          totalProtocolStake,
          maxApy: computeMaxApy(votes.current, inputs.apy),
          minAmountToStake: minDelegation,
          unboundPeriodInMillis: estimateUnboundPeriodMs(epochInfo.slotsInEpoch),
          redelegateFeeRate: 0,
          activeValidators: votes.current.length,
          totalValidators: votes.current.length + votes.delinquent.length,
        },
      };
    },
  };
}

export type SolanaStakingService = ReturnType<typeof createStakingService>;
