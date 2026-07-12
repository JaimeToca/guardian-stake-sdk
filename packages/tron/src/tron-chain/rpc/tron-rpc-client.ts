import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger, fetchOrError, ApiError } from "@guardian-sdk/sdk";
import JSONbig from "json-bigint";
import type { TronRpcClientContract } from "./tron-rpc-client-contract";
import type {
  TronAccount,
  TronAccountResources,
  TronResource,
  TronWitness,
} from "./tron-rpc-types";

const jsonBig = JSONbig({ useNativeBigInt: true });

/**
 * FullNode balances/votes are int64 SUN values that can exceed Number.MAX_SAFE_INTEGER, so
 * parse the raw body with json-bigint instead of axios's default JSON.parse (which would
 * silently lose precision). Passed as axios `transformResponse` on every call.
 */
const parseBigIntResponse = (raw: unknown): unknown =>
  typeof raw === "string" && raw.length > 0 ? jsonBig.parse(raw) : raw;

const num = (v: bigint | number | undefined): number =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0;
const big = (v: bigint | number | undefined): bigint =>
  typeof v === "bigint" ? v : typeof v === "number" ? BigInt(Math.trunc(v)) : 0n;

/** Tron encodes on-chain failure reasons as a hex string in `message`; decode to a readable error. */
const decodeHexMessage = (message: string | undefined): string | undefined => {
  if (!message) return undefined;
  try {
    return Buffer.from(message, "hex").toString("utf8") || undefined;
  } catch {
    return message;
  }
};

export function createTronRpcClient(
  rpcUrl: string,
  logger: Logger = new NoopLogger()
): TronRpcClientContract {
  return {
    async getAccount(address) {
      const raw = await fetchOrError<{
        balance?: bigint | number;
        frozenV2?: { type?: string; amount?: bigint | number }[];
        unfrozenV2?: {
          unfreeze_amount?: bigint | number;
          unfreeze_expire_time?: bigint | number;
        }[];
        votes?: { vote_address: string; vote_count: bigint | number }[];
      }>({
        url: `${rpcUrl}/wallet/getaccount`,
        method: "POST",
        data: { address, visible: true },
        transformResponse: [parseBigIntResponse],
      });
      const frozen = (raw.frozenV2 ?? [])
        .filter((f) => f.type !== "TRON_POWER" && big(f.amount) > 0n)
        .map((f) => ({
          resource: (f.type === "ENERGY" ? "ENERGY" : "BANDWIDTH") as TronResource,
          amount: big(f.amount),
        }));
      const account: TronAccount = {
        balance: big(raw.balance),
        frozen,
        unfreezing: (raw.unfrozenV2 ?? []).map((u) => {
          const rawExpiry = u.unfreeze_expire_time;
          const expireTime =
            rawExpiry == null || num(rawExpiry) <= 0 ? Number.MAX_SAFE_INTEGER : num(rawExpiry);
          return { amount: big(u.unfreeze_amount), expireTime };
        }),
        votes: (raw.votes ?? []).map((v) => ({
          srAddress: v.vote_address,
          votes: big(v.vote_count),
        })),
      };
      return account;
    },
    async getAccountResources(address) {
      const raw = await fetchOrError<{
        freeNetLimit?: bigint | number;
        freeNetUsed?: bigint | number;
        NetLimit?: bigint | number;
        NetUsed?: bigint | number;
      }>({
        url: `${rpcUrl}/wallet/getaccountresource`,
        method: "POST",
        data: { address, visible: true },
        transformResponse: [parseBigIntResponse],
      });
      const resources: TronAccountResources = {
        freeNetLimit: big(raw.freeNetLimit),
        freeNetUsed: big(raw.freeNetUsed),
        netLimit: big(raw.NetLimit),
        netUsed: big(raw.NetUsed),
      };
      return resources;
    },
    async getReward(address) {
      const raw = await fetchOrError<{ reward?: bigint | number }>({
        url: `${rpcUrl}/wallet/getReward`,
        method: "POST",
        data: { address, visible: true },
        transformResponse: [parseBigIntResponse],
      });
      return big(raw.reward);
    },
    async listWitnesses() {
      const raw = await fetchOrError<{
        witnesses?: {
          address: string;
          voteCount?: bigint | number;
          url?: string;
          isJobs?: boolean;
        }[];
      }>({
        url: `${rpcUrl}/wallet/listwitnesses`,
        method: "POST",
        transformResponse: [parseBigIntResponse],
      });
      return (raw.witnesses ?? []).map<TronWitness>((w) => ({
        address: w.address,
        voteCount: big(w.voteCount),
        url: w.url ?? "",
        isSr: w.isJobs === true,
      }));
    },
    async getChainParameters() {
      const raw = await fetchOrError<{
        chainParameter?: { key: string; value?: bigint | number }[];
      }>({
        url: `${rpcUrl}/wallet/getchainparameters`,
        method: "POST",
        transformResponse: [parseBigIntResponse],
      });
      return Object.fromEntries((raw.chainParameter ?? []).map((p) => [p.key, num(p.value)]));
    },
    async getBrokerage(address) {
      const raw = await fetchOrError<{ brokerage?: bigint | number }>({
        url: `${rpcUrl}/wallet/getbrokerage`,
        method: "POST",
        data: { address, visible: true },
        transformResponse: [parseBigIntResponse],
      });
      return num(raw.brokerage);
    },
    async broadcast(signedTxJson) {
      const raw = await fetchOrError<{
        result?: boolean;
        txid?: string;
        code?: string;
        message?: string;
      }>({
        url: `${rpcUrl}/wallet/broadcasttransaction`,
        method: "POST",
        data: JSON.parse(signedTxJson),
        transformResponse: [parseBigIntResponse],
      });
      // The FullNode returns HTTP 200 even for a rejected broadcast, so fetchOrError won't throw.
      // Surface the node's own code + decoded reason instead of masking it behind a generic error.
      if (raw.result !== true && !raw.txid) {
        const reason = decodeHexMessage(raw.message);
        logger.error("Tron broadcast rejected", { code: raw.code, message: reason });
        throw new ApiError(
          `Tron broadcast rejected: ${raw.code ?? "FAILED"}${reason ? ` — ${reason}` : ""}`,
          { type: "ServerResponseError" }
        );
      }
      return raw.txid ?? "";
    },
  };
}
