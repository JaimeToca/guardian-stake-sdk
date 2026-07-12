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

const CACHE_TTL_MS = 3 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

const BLOCKS_PER_DAY = 28_800;
const DAYS_PER_YEAR = 365;
const SR_COUNT = 27;

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
 * NOTE: the SR block-reward term follows the reference doc; validate against real on-chain
 * numbers during integration and adjust if the doc's dimensional factor is off. See spec §8 [VERIFY].
 */
export function computeApr(input: AprInput): number {
  const validatorVotes = Number(input.validatorVotes);
  const totalVotes = Number(input.totalVotes);
  if (validatorVotes <= 0 || totalVotes <= 0) return 0;

  const annualVoteRewardsPool = input.witness127PayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR;
  const annualVotingRewards = (validatorVotes * annualVoteRewardsPool) / totalVotes;
  const srBlockRewards = input.isSr ? input.witnessPayPerBlock * DAYS_PER_YEAR * SR_COUNT : 0;
  const totalAnnualRewards = annualVotingRewards + srBlockRewards;

  const clampedBrokeragePercent = Math.min(100, Math.max(0, input.brokeragePercent));
  const brokerageShare = 1 - clampedBrokeragePercent / 100;
  const apr = ((totalAnnualRewards * brokerageShare) / validatorVotes) * 100;
  if (!Number.isFinite(apr) || apr < 0) return 0;
  return apr;
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
  let cache: { at: number; witnesses: Validator[]; totalVotes: bigint } | undefined;
  let inflight: Promise<{ witnesses: Validator[]; totalVotes: bigint }> | undefined;
  const tronWeb = createTronWeb();
  const toBase58 = (addr: string): string =>
    addr.startsWith("41") ? tronWeb.address.fromHex(addr) : addr;

  async function doLoad(): Promise<{ witnesses: Validator[]; totalVotes: bigint }> {
    logger.debug("StakingService: witness cache miss — fetching from RPC");
    const [raw, params] = await Promise.all([rpc.listWitnesses(), rpc.getChainParameters()]);
    const totalVotes = raw.reduce((s, w) => s + w.voteCount, 0n);
    const witnesses = await Promise.all(
      raw.map(async (w): Promise<Validator> => {
        const address = toBase58(w.address);
        const brokeragePercent = await rpc.getBrokerage(address).catch(() => 20);
        const apy = computeApr({
          validatorVotes: w.voteCount,
          totalVotes,
          isSr: w.isSr,
          witness127PayPerBlock: params.getWitness127PayPerBlock ?? 0,
          witnessPayPerBlock: params.getWitnessPayPerBlock ?? 0,
          brokeragePercent,
        });
        return {
          id: address,
          status: w.isSr ? "Active" : "Inactive",
          name: w.url || address,
          description: "",
          image: undefined,
          apy,
          delegators: undefined,
          operatorAddress: address,
          creditAddress: "",
        };
      })
    );
    cache = { at: Date.now(), witnesses, totalVotes };
    logger.debug("StakingService: witness cache refreshed", { count: witnesses.length });
    return cache;
  }

  async function load(): Promise<{ witnesses: Validator[]; totalVotes: bigint }> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
      logger.debug("StakingService: witness cache hit", { count: cache.witnesses.length });
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

  async function getWitnessMap(): Promise<Map<string, Validator>> {
    const { witnesses } = await load();
    return new Map(witnesses.map((v) => [v.operatorAddress, v]));
  }

  function unbondPeriodMs(days: number): number {
    return (days > 0 ? days : 14) * MS_PER_DAY;
  }

  return {
    getWitnessMap,

    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
      const { witnesses } = await load();
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? witnesses.length;
      const start = (page - 1) * pageSize;
      const data = witnesses.slice(start, start + pageSize);
      return {
        data,
        pagination: {
          page,
          pageSize,
          total: witnesses.length,
          totalPages: Math.max(1, Math.ceil(witnesses.length / pageSize)),
          hasNextPage: start + pageSize < witnesses.length,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      const [account, witnessMap, params] = await Promise.all([
        rpc.getAccount(address),
        getWitnessMap(),
        rpc.getChainParameters(),
      ]);
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

      const { witnesses, totalVotes } = await load();
      const maxApy = witnesses.reduce((m, v) => Math.max(m, v.apy), 0);
      return {
        delegations,
        stakingSummary: {
          totalProtocolStake: Number(totalVotes),
          maxApy,
          minAmountToStake: SUN_PER_TRX,
          unboundPeriodInMillis: unbondPeriodMs(params.getUnfreezeDelayDays ?? 14),
          redelegateFeeRate: 0,
          activeValidators: witnesses.filter((v) => v.status === "Active").length,
          totalValidators: witnesses.length,
        },
      };
    },
  };
}
