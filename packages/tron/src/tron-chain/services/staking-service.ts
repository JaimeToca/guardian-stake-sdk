import type {
  Delegation,
  Delegations,
  GetValidatorsParams,
  Validator,
  ValidatorsPage,
} from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
import type { TronResource } from "../rpc/tron-rpc-types";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import type { TronStakingServiceContract } from "./staking-service-contract";
import { SUN_PER_TRX } from "../tx/tron-types";
import { computeApr } from "../apr/apr-calculator";

const CACHE_TTL_MS = 3 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

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
  createTronWeb: TronWebFactory["create"]
): TronStakingServiceContract {
  let cache: { at: number; witnesses: Validator[]; totalVotes: bigint } | undefined;
  const tronWeb = createTronWeb();
  const toBase58 = (addr: string): string =>
    addr.startsWith("41") ? tronWeb.address.fromHex(addr) : addr;

  async function load(): Promise<{ witnesses: Validator[]; totalVotes: bigint }> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
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
    return cache;
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

      // Active: one per vote
      for (const vote of account.votes) {
        const validator = witnessMap.get(vote.srAddress) ?? placeholderValidator("BANDWIDTH");
        delegations.push({
          id: `${address}:${vote.srAddress}`,
          validator,
          amount: vote.votes * SUN_PER_TRX,
          status: "Active",
          delegationIndex: BigInt(idx++),
          pendingUntil: 0,
        });
      }
      // Frozen: unvoted remainder (resource-granular; attribute to the largest frozen resource)
      const remainder = totalFrozen - totalVoted;
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
