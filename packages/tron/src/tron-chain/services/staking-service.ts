import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  Logger,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import { NoopLogger, validatePageParams, createInMemoryCache } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
import type { TronResource } from "../rpc/tron-rpc-types";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import type { TronStakingServiceContract } from "./staking-service-contract";
import { SUN_PER_TRX } from "../tx/tron-types";

const CACHE_TTL_MS = 15 * 60 * 1000;
const PARAMS_TTL_MS = 10 * 60 * 1000;
const BROKERAGE_TTL_MS = 30 * 60 * 1000;
const BROKERAGE_CONCURRENCY = 8;
const MS_PER_DAY = 86_400_000;

const BLOCKS_PER_DAY = 28_800;
const DAYS_PER_YEAR = 365;
const SR_COUNT = 27;
/** Used only for `stakingSummary.maxApy`, an approximation across all witnesses that avoids
 * a per-SR `getBrokerage` fan-out. Matches the fallback `getBrokerageCached` uses on RPC failure. */
const DEFAULT_BROKERAGE_PERCENT = 20;

/**
 * Runs `fn` over `items` with at most `limit` in-flight calls at a time,
 * preserving input order in the returned array.
 */
export function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i] as T);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, items.length));
  return Promise.all(Array.from({ length: workerCount }, worker)).then(() => results);
}

export interface AprInput {
  validatorVotes: bigint;
  totalVotes: bigint;
  isSr: boolean;
  witness127PayPerBlock: number; // vote reward per block (SUN)
  witnessPayPerBlock: number; // SR block production reward per block (SUN)
  brokeragePercent: number; // percent the SR keeps (0..100)
}

/**
 * Voter APR for a witness, per apr_tron.txt.
 * Returns a percentage (e.g. 2.48 for 2.48%).
 * The SR block-reward term uses the corrected formula (witnessPay * blocks/day * days / 27).
 */
export function computeApr(input: AprInput): number {
  const validatorVotes = Number(input.validatorVotes);
  const totalVotes = Number(input.totalVotes);
  if (validatorVotes <= 0 || totalVotes <= 0) return 0;

  const annualVoteRewardsPool = input.witness127PayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR;
  const annualVotingRewards = (validatorVotes * annualVoteRewardsPool) / totalVotes;
  const srBlockRewards = input.isSr
    ? (input.witnessPayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR) / SR_COUNT
    : 0;
  const totalAnnualRewards = annualVotingRewards + srBlockRewards;

  const clampedBrokeragePercent = Math.min(100, Math.max(0, input.brokeragePercent));
  const brokerageShare = 1 - clampedBrokeragePercent / 100;
  const apr = ((totalAnnualRewards * brokerageShare) / validatorVotes / Number(SUN_PER_TRX)) * 100;
  if (!Number.isFinite(apr) || apr < 0) return 0;
  return apr;
}

/** Cheap, per-witness data cached at load time — no per-SR brokerage/APR. */
export interface RawWitness {
  address: string; // base58
  voteCount: bigint;
  name: string;
  isSr: boolean;
}

/** Cached witness-list load: the raw witnesses, their vote total, and chain params. */
interface LoadResult {
  raw: RawWitness[];
  totalVotes: bigint;
  params: Record<string, number>;
}

/** Single-entry cache keys (these caches hold one value each; per-SR brokerage keys by address). */
const WITNESS_KEY = "witnesses";
const PARAMS_KEY = "params";

/** Whole-TRX vote count → SUN. Tron's `vote_count` is denominated in whole TRX (1 vote = 1 TRX). */
const votesToSun = (votes: bigint): bigint => votes * SUN_PER_TRX;

/**
 * Builds a `Validator` from the fields that vary, filling the rest with the neutral defaults every
 * Tron validator shares. Keeps the `Validator` shape defined in one place so a field added to the
 * type doesn't have to be threaded through every construction site by hand.
 */
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

/** Non-null stand-in for `Frozen`/`Pending`/`Claimable` positions, which have no real SR. */
function placeholderValidator(resource: TronResource): Validator {
  return buildValidator({
    id: `tron-frozen-${resource.toLowerCase()}`,
    status: "Inactive",
    name: "Frozen — vote to earn rewards",
    description: `Staked for ${resource}. Vote for a Super Representative to start earning TRX rewards.`,
  });
}

/**
 * Stand-in for an `Active` vote whose SR isn't in the current witness list (e.g. a delisted SR).
 * The position IS voted, so it must NOT reuse `placeholderValidator` ("vote to earn rewards" would
 * be misleading) — carry the SR address through so consumers can still identify it.
 */
function unknownSrValidator(srAddress: string): Validator {
  return buildValidator({
    id: srAddress,
    status: "Inactive",
    name: srAddress,
    description: "Super Representative not in the current witness list",
    operatorAddress: srAddress,
  });
}

/** One vote scaled to its share of currently-frozen Tron Power (SUN). `amount: 0n` means stale. */
export interface ScaledVote {
  srAddress: string;
  amount: bigint;
}

/**
 * Scales raw votes down to the currently-frozen total when a partial unfreeze has left `totalVoted`
 * reporting more Tron Power than is actually frozen. Uses floor division per vote and assigns the
 * lost dust to the last vote, so `Σ amount === effectiveVoted` exactly. When no scaling is needed
 * each vote keeps its raw amount. A vote that scales to `0n` is stale (fully unfrozen, not re-cast).
 */
export function scaleVotesToFrozen(
  votes: readonly { srAddress: string; votes: bigint }[],
  totalFrozen: bigint,
  totalVoted: bigint,
  effectiveVoted: bigint
): ScaledVote[] {
  // totalVoted > totalFrozen already implies totalVoted > 0 (frozen is never negative).
  const needsScaling = totalVoted > totalFrozen;
  let scaledSoFar = 0n;
  return votes.map((vote, i) => {
    const rawAmount = votesToSun(vote.votes);
    const isLastVote = i === votes.length - 1;
    const amount = !needsScaling
      ? rawAmount
      : isLastVote
        ? effectiveVoted - scaledSoFar
        : (rawAmount * totalFrozen) / totalVoted;
    scaledSoFar += amount;
    return { srAddress: vote.srAddress, amount };
  });
}

/**
 * Splits the unvoted Tron-Power `remainder` across the frozen resources, largest-first, capping each
 * chunk at that resource's own frozen amount. Votes aren't resource-tagged on-chain, so which
 * resource is "unvoted" is ambiguous — but capping per resource guarantees each `Frozen` entry's
 * amount never exceeds what's actually frozen for that resource, so it stays a valid `Undelegate`
 * amount. With no votes at all, this yields exactly one entry per frozen resource (its full amount).
 * `Σ chunks === remainder` because `remainder ≤ totalFrozen === Σ resource amounts`.
 */
export function splitRemainderByResource(
  frozen: readonly { resource: TronResource; amount: bigint }[],
  remainder: bigint
): { resource: TronResource; amount: bigint }[] {
  const largestFirst = [...frozen].sort((a, b) =>
    b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0
  );
  const chunks: { resource: TronResource; amount: bigint }[] = [];
  let left = remainder;
  for (const f of largestFirst) {
    if (left <= 0n) break;
    const chunk = f.amount < left ? f.amount : left;
    if (chunk > 0n) chunks.push({ resource: f.resource, amount: chunk });
    left -= chunk;
  }
  return chunks;
}

export function createStakingService(
  rpc: TronRpcClientContract,
  createTronWeb: TronWebFactory["create"],
  logger: Logger = new NoopLogger()
): TronStakingServiceContract {
  // Value storage uses the SDK's TTL cache (shared with BSC); the in-flight maps layered on
  // top provide single-flight dedup — the SDK cache is TTL-only and does NOT dedup concurrent
  // misses, which is exactly what prevents the getBrokerage thundering herd.
  const witnessCache = createInMemoryCache<string, LoadResult>();
  let inflight: Promise<LoadResult> | undefined;
  const paramsCache = createInMemoryCache<string, Record<string, number>>();
  let paramsInflight: Promise<Record<string, number>> | undefined;
  const brokerageCache = createInMemoryCache<string, number>();
  const brokerageInflight = new Map<string, Promise<number>>();
  const tronWeb = createTronWeb();
  const toBase58 = (addr: string): string =>
    addr.startsWith("41") ? tronWeb.address.fromHex(addr) : addr;

  async function getParams(): Promise<Record<string, number>> {
    const cached = paramsCache.get(PARAMS_KEY);
    if (cached) {
      return cached;
    }
    if (paramsInflight) {
      return paramsInflight;
    }
    paramsInflight = rpc
      .getChainParameters()
      .then((value) => {
        paramsCache.set(PARAMS_KEY, value, PARAMS_TTL_MS);
        return value;
      })
      .finally(() => {
        paramsInflight = undefined;
      });
    return paramsInflight;
  }

  async function getBrokerageCached(address: string): Promise<number> {
    const cached = brokerageCache.get(address);
    if (cached !== undefined) {
      return cached;
    }
    const existingInflight = brokerageInflight.get(address);
    if (existingInflight) {
      return existingInflight;
    }
    const fetchPromise = rpc
      .getBrokerage(address)
      .then((value) => {
        // Only cache successful fetches — caching the fallback would poison a
        // transiently-failed SR for the full TTL. Let the next call retry instead.
        brokerageCache.set(address, value, BROKERAGE_TTL_MS);
        return value;
      })
      .catch(() => DEFAULT_BROKERAGE_PERCENT)
      .finally(() => {
        brokerageInflight.delete(address);
      });
    brokerageInflight.set(address, fetchPromise);
    return fetchPromise;
  }

  /**
   * Cheap load: 1 `listWitnesses` + params. No per-SR `getBrokerage` calls here —
   * brokerage/APR enrichment is deferred to `enrichApr`, called only for the
   * witnesses a caller actually needs (a page, or the SRs an account voted for).
   */
  async function doLoad(): Promise<LoadResult> {
    logger.debug("StakingService: witness cache miss — fetching from RPC");
    const [rawWitnesses, params] = await Promise.all([rpc.listWitnesses(), getParams()]);
    const totalVotes = rawWitnesses.reduce((s, w) => s + w.voteCount, 0n);
    const raw: RawWitness[] = rawWitnesses.map((w) => {
      const address = toBase58(w.address);
      return {
        address,
        voteCount: w.voteCount,
        name: w.url || address,
        isSr: w.isSr,
      };
    });
    const result: LoadResult = { raw, totalVotes, params };
    witnessCache.set(WITNESS_KEY, result, CACHE_TTL_MS);
    logger.debug("StakingService: witness cache refreshed", { count: raw.length });
    return result;
  }

  async function load(): Promise<LoadResult> {
    const cached = witnessCache.get(WITNESS_KEY);
    if (cached) {
      logger.debug("StakingService: witness cache hit", { count: cached.raw.length });
      return cached;
    }
    if (inflight) {
      logger.debug("StakingService: witness load already in flight — awaiting it");
      return inflight;
    }
    inflight = doLoad().finally(() => {
      inflight = undefined;
    });
    return inflight;
  }

  /** Fetches real brokerage for `raw.address` and computes the actual APR — the only place brokerage is fetched. */
  async function enrichApr(
    raw: RawWitness,
    totalVotes: bigint,
    params: Record<string, number>
  ): Promise<Validator> {
    const brokeragePercent = await getBrokerageCached(raw.address);
    const apy = computeApr({
      validatorVotes: raw.voteCount,
      totalVotes,
      isSr: raw.isSr,
      witness127PayPerBlock: params.getWitness127PayPerBlock ?? 0,
      witnessPayPerBlock: params.getWitnessPayPerBlock ?? 0,
      brokeragePercent,
    });
    return buildValidator({
      id: raw.address,
      status: raw.isSr ? "Active" : "Inactive",
      name: raw.name,
      apy,
      operatorAddress: raw.address,
    });
  }

  /** Cheap map for callers (fee-service's `assertVote`) that only need address/name/status — no brokerage fetch. */
  async function getWitnessMap(): Promise<Map<string, Validator>> {
    const { raw } = await load();
    return new Map(
      raw.map((w) => [
        w.address,
        buildValidator({
          id: w.address,
          status: w.isSr ? "Active" : "Inactive",
          name: w.name,
          operatorAddress: w.address,
        }),
      ])
    );
  }

  function unbondPeriodMs(days: number): number {
    return (days > 0 ? days : 14) * MS_PER_DAY;
  }

  return {
    getWitnessMap,

    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
      validatePageParams(params ?? {});
      const { raw, totalVotes, params: chainParams } = await load();
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? raw.length;
      const start = (page - 1) * pageSize;
      const rawPage = raw.slice(start, start + pageSize);
      // Enrich (fetch brokerage + compute APR) ONLY the requested page — not all witnesses.
      const data = await mapWithConcurrency(rawPage, BROKERAGE_CONCURRENCY, (w) =>
        enrichApr(w, totalVotes, chainParams)
      );
      return {
        data,
        pagination: {
          page,
          pageSize,
          total: raw.length,
          totalPages: Math.max(1, Math.ceil(raw.length / pageSize)),
          hasNextPage: start + pageSize < raw.length,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      const [account, { raw, totalVotes, params }] = await Promise.all([
        rpc.getAccount(address),
        load(),
      ]);
      const rawByAddress = new Map(raw.map((w) => [w.address, w]));

      // Enrich (fetch brokerage + compute real APR) ONLY the distinct SRs this account voted for.
      const distinctVotedAddresses = Array.from(new Set(account.votes.map((v) => v.srAddress)));
      const enrichedByAddress = new Map<string, Validator>(
        (
          await mapWithConcurrency(distinctVotedAddresses, BROKERAGE_CONCURRENCY, async (addr) => {
            const rawWitness = rawByAddress.get(addr);
            if (!rawWitness) return undefined;
            return [addr, await enrichApr(rawWitness, totalVotes, params)] as const;
          })
        ).filter((entry): entry is readonly [string, Validator] => entry !== undefined)
      );
      // A resource-granular view is reconstructed from three independent on-chain sources, in a
      // fixed order (delegationIndex is assigned once, at the end):
      //   Active              — one per vote, scaled to currently-frozen Tron Power
      //   Frozen              — the unvoted Tron-Power remainder, split per frozen resource
      //   Pending / Claimable — one per unfreezing entry, split by whether the 14-day bond matured
      // Sum invariants: Σ Active + Σ Frozen === Σ frozen (Staked); Σ Pending + Σ Claimable === Σ unfrozen.
      // NOTE: an Active `amount` is voted Tron Power, NOT a per-resource unstake size — unfreeze
      // amounts come from the Frozen/Pending/Claimable entries, which are capped per resource.
      const totalFrozen = account.frozen.reduce((s, f) => s + f.amount, 0n);
      const totalVoted = account.votes.reduce((s, v) => s + votesToSun(v.votes), 0n);
      // A partial unfreeze can leave votes reporting more Tron Power than is currently frozen.
      const effectiveVoted = totalVoted <= totalFrozen ? totalVoted : totalFrozen;

      const activeParts: Omit<Delegation, "delegationIndex">[] = scaleVotesToFrozen(
        account.votes,
        totalFrozen,
        totalVoted,
        effectiveVoted
      )
        // Drop stale votes (zero Tron Power backing) so we never surface a 0-amount Active entry.
        .filter((v) => v.amount > 0n)
        .map((v) => ({
          id: `${address}:${v.srAddress}`,
          validator: enrichedByAddress.get(v.srAddress) ?? unknownSrValidator(v.srAddress),
          amount: v.amount,
          status: "Active",
          pendingUntil: 0,
        }));

      const frozenParts: Omit<Delegation, "delegationIndex">[] = splitRemainderByResource(
        account.frozen,
        totalFrozen - effectiveVoted
      ).map((r) => ({
        id: `${address}:frozen-${r.resource}`,
        validator: placeholderValidator(r.resource),
        amount: r.amount,
        status: "Frozen",
        pendingUntil: 0,
      }));

      const now = Date.now();
      const unfreezeParts: Omit<Delegation, "delegationIndex">[] = account.unfreezing
        // Ignore zero-amount unfreeze rows (mirrors the RPC client's filter on frozen amounts).
        .filter((u) => u.amount > 0n)
        .map((u) => ({
          id: `${address}:unfreeze-${u.resource}-${u.expireTime}`,
          validator: placeholderValidator(u.resource),
          amount: u.amount,
          status: u.expireTime <= now ? "Claimable" : "Pending",
          pendingUntil: u.expireTime,
        }));

      const delegations: Delegation[] = [...activeParts, ...frozenParts, ...unfreezeParts].map(
        (part, i) => ({ ...part, delegationIndex: BigInt(i) })
      );

      // maxApy is an approximation across ALL witnesses using the DEFAULT brokerage (20%),
      // so it needs only cached voteCount + params — no per-SR getBrokerage fan-out.
      const maxApy = raw.reduce(
        (m, w) =>
          Math.max(
            m,
            computeApr({
              validatorVotes: w.voteCount,
              totalVotes,
              isSr: w.isSr,
              witness127PayPerBlock: params.getWitness127PayPerBlock ?? 0,
              witnessPayPerBlock: params.getWitnessPayPerBlock ?? 0,
              brokeragePercent: DEFAULT_BROKERAGE_PERCENT,
            })
          ),
        0
      );
      return {
        delegations,
        stakingSummary: {
          totalProtocolStake: Number(totalVotes),
          maxApy,
          minAmountToStake: SUN_PER_TRX,
          unboundPeriodInMillis: unbondPeriodMs(params.getUnfreezeDelayDays ?? 14),
          redelegateFeeRate: 0,
          activeValidators: raw.filter((w) => w.isSr).length,
          totalValidators: raw.length,
        },
      };
    },
  };
}
