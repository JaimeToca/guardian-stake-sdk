import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  Logger,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import { NoopLogger } from "@guardian-sdk/sdk";
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

function placeholderValidator(resource: TronResource): Validator {
  return {
    id: `tron-frozen-${resource.toLowerCase()}`,
    status: "Inactive",
    name: "Frozen — vote to earn rewards",
    description: `Staked for ${resource}. Vote for a Super Representative to start earning TRX rewards.`,
    image: undefined,
    apy: 0,
    delegators: undefined,
    operatorAddress: "",
    creditAddress: "",
  };
}

export function createStakingService(
  rpc: TronRpcClientContract,
  createTronWeb: TronWebFactory["create"],
  logger: Logger = new NoopLogger()
): TronStakingServiceContract {
  let cache:
    | { at: number; raw: RawWitness[]; totalVotes: bigint; params: Record<string, number> }
    | undefined;
  let inflight:
    | Promise<{ raw: RawWitness[]; totalVotes: bigint; params: Record<string, number> }>
    | undefined;
  let paramsCache: { at: number; value: Record<string, number> } | undefined;
  let paramsInflight: Promise<Record<string, number>> | undefined;
  const brokerageCache = new Map<string, { at: number; value: number }>();
  const tronWeb = createTronWeb();
  const toBase58 = (addr: string): string =>
    addr.startsWith("41") ? tronWeb.address.fromHex(addr) : addr;

  async function getParams(): Promise<Record<string, number>> {
    if (paramsCache && Date.now() - paramsCache.at < PARAMS_TTL_MS) {
      return paramsCache.value;
    }
    if (paramsInflight) {
      return paramsInflight;
    }
    paramsInflight = rpc
      .getChainParameters()
      .then((value) => {
        paramsCache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        paramsInflight = undefined;
      });
    return paramsInflight;
  }

  async function getBrokerageCached(address: string): Promise<number> {
    const cached = brokerageCache.get(address);
    if (cached && Date.now() - cached.at < BROKERAGE_TTL_MS) {
      return cached.value;
    }
    const value = await rpc.getBrokerage(address).catch(() => 20);
    brokerageCache.set(address, { at: Date.now(), value });
    return value;
  }

  /**
   * Cheap load: 1 `listWitnesses` + params. No per-SR `getBrokerage` calls here —
   * brokerage/APR enrichment is deferred to `enrichApr`, called only for the
   * witnesses a caller actually needs (a page, or the SRs an account voted for).
   */
  async function doLoad(): Promise<{
    raw: RawWitness[];
    totalVotes: bigint;
    params: Record<string, number>;
  }> {
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
    cache = { at: Date.now(), raw, totalVotes, params };
    logger.debug("StakingService: witness cache refreshed", { count: raw.length });
    return cache;
  }

  async function load(): Promise<{
    raw: RawWitness[];
    totalVotes: bigint;
    params: Record<string, number>;
  }> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      logger.debug("StakingService: witness cache hit", { count: cache.raw.length });
      return cache;
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
    return {
      id: raw.address,
      status: raw.isSr ? "Active" : "Inactive",
      name: raw.name,
      description: "",
      image: undefined,
      apy,
      delegators: undefined,
      operatorAddress: raw.address,
      creditAddress: "",
    };
  }

  /** Cheap map for callers (fee-service's `assertVote`) that only need address/name/status — no brokerage fetch. */
  async function getWitnessMap(): Promise<Map<string, Validator>> {
    const { raw } = await load();
    return new Map(
      raw.map((w) => [
        w.address,
        {
          id: w.address,
          status: w.isSr ? "Active" : "Inactive",
          name: w.name,
          description: "",
          image: undefined,
          apy: 0,
          delegators: undefined,
          operatorAddress: w.address,
          creditAddress: "",
        } satisfies Validator,
      ])
    );
  }

  function unbondPeriodMs(days: number): number {
    return (days > 0 ? days : 14) * MS_PER_DAY;
  }

  return {
    getWitnessMap,

    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
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
      const witnessMap = enrichedByAddress;
      const delegations: Delegation[] = [];
      let idx = 0;
      const totalFrozen = account.frozen.reduce((s, f) => s + f.amount, 0n);
      const totalVoted = account.votes.reduce((s, v) => s + v.votes * SUN_PER_TRX, 0n);
      // A partial unfreeze can leave the votes record reporting more than is currently frozen.
      // Cap the voted portion at totalFrozen so Σ Active never exceeds current stake.
      const effectiveVoted = totalVoted <= totalFrozen ? totalVoted : totalFrozen;

      // Active: one per vote
      const needsScaling = totalVoted > totalFrozen && totalVoted !== 0n;
      let scaledSoFar = 0n;
      for (const [voteIdx, vote] of account.votes.entries()) {
        const validator = witnessMap.get(vote.srAddress) ?? placeholderValidator("BANDWIDTH");
        const rawAmount = vote.votes * SUN_PER_TRX;
        const isLastVote = voteIdx === account.votes.length - 1;
        // Floor division on each vote independently loses "dust" across multiple votes.
        // Assign the residual to the last vote so Σ Active === effectiveVoted exactly.
        const scaledAmount = !needsScaling
          ? rawAmount
          : isLastVote
            ? effectiveVoted - scaledSoFar
            : (rawAmount * totalFrozen) / totalVoted;
        scaledSoFar += scaledAmount;
        delegations.push({
          id: `${address}:${vote.srAddress}`,
          validator,
          amount: scaledAmount,
          status: "Active",
          delegationIndex: BigInt(idx++),
          pendingUntil: 0,
        });
      }
      // Frozen: unvoted remainder (resource-granular; attribute to the largest frozen resource)
      const remainder = totalFrozen - effectiveVoted;
      if (remainder > 0n) {
        const resource: TronResource = account.frozen.reduce(
          (a, b) => (b.amount > a.amount ? b : a),
          account.frozen[0] ?? { resource: "BANDWIDTH", amount: 0n }
        ).resource;
        delegations.push({
          id: `${address}:frozen-${resource}`,
          validator: placeholderValidator(resource),
          amount: remainder,
          status: "Frozen",
          delegationIndex: BigInt(idx++),
          pendingUntil: 0,
        });
      }
      // Pending / Claimable: one per unfreezing entry
      const now = Date.now();
      for (const u of account.unfreezing) {
        const matured = u.expireTime <= now;
        delegations.push({
          id: `${address}:unfreeze-${u.expireTime}`,
          validator: placeholderValidator("BANDWIDTH"),
          amount: u.amount,
          status: matured ? "Claimable" : "Pending",
          delegationIndex: BigInt(idx++),
          pendingUntil: u.expireTime,
        });
      }

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
