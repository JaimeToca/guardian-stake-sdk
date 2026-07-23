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

function mapVoteToValidator(vote: VoteAccountInfo, status: "Active" | "Inactive"): Validator {
  return buildValidator({
    id: vote.votePubkey,
    status,
    name: vote.votePubkey,
    operatorAddress: vote.votePubkey,
    apy: 0,
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
  const voteCache = createInMemoryCache<string, VoteAccountsResult>(validatorsTtl);

  async function loadVoteAccounts(): Promise<VoteAccountsResult> {
    const cached = voteCache.get(VALIDATORS_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: vote accounts cache hit", {
        current: cached.current.length,
        delinquent: cached.delinquent.length,
      });
      return cached;
    }
    logger.debug("StakingService: vote accounts cache miss — fetching");
    const result = await rpc.getVoteAccounts();
    voteCache.set(VALIDATORS_CACHE_KEY, result, validatorsTtl);
    return result;
  }

  function validatorMap(votes: VoteAccountsResult): Map<string, Validator> {
    const map = new Map<string, Validator>();
    for (const v of votes.current) {
      map.set(v.votePubkey, mapVoteToValidator(v, "Active"));
    }
    for (const v of votes.delinquent) {
      if (!map.has(v.votePubkey)) {
        map.set(v.votePubkey, mapVoteToValidator(v, "Inactive"));
      }
    }
    return map;
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

      const votes = await loadVoteAccounts();
      const all: Validator[] = [
        ...votes.current.map((v) => mapVoteToValidator(v, "Active")),
        ...votes.delinquent.map((v) => mapVoteToValidator(v, "Inactive")),
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

      const [positions, votes, minDelegation, epochInfo] = await Promise.all([
        loadPositions({ rpc, cache, config, logger }, address),
        loadVoteAccounts(),
        rpc.getStakeMinimumDelegation(),
        rpc.getEpochInfo(),
      ]);

      const byVote = validatorMap(votes);
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
        if (amount === 0n && status !== "Claimable") {
          // Drop zero-weight active/pending noise; claimable with 0 is already omitted by loadPositions.
          continue;
        }
        if (amount === 0n) continue;

        delegations.push({
          id: position.stakeAccount,
          validator: resolveValidator(position, byVote),
          amount,
          status,
          delegationIndex: BigInt(position.seedIndex ?? 0),
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
          maxApy: 0,
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
