import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger, ApiError } from "@guardian-sdk/sdk";
import JSONbig from "json-bigint";
import type { TronRpcClientContract } from "./tron-rpc-client-contract";
import type {
  TronAccount,
  TronAccountResources,
  TronResource,
  TronWitness,
} from "./tron-rpc-types";

const jsonBig = JSONbig({ useNativeBigInt: true });

const num = (v: bigint | number | undefined): number =>
  typeof v === "number" ? v : typeof v === "bigint" ? Number(v) : 0;
const big = (v: bigint | number | undefined): bigint =>
  typeof v === "bigint" ? v : typeof v === "number" ? BigInt(Math.trunc(v)) : 0n;

export function createTronRpcClient(
  rpcUrl: string,
  logger: Logger = new NoopLogger()
): TronRpcClientContract {
  async function post(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${rpcUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok)
      throw new ApiError("Tron RPC error", { status: res.status, type: "ServerResponseError" });
    const text = await res.text();
    return jsonBig.parse(text) as unknown;
  }

  return {
    async getAccount(address) {
      const raw = (await post("/wallet/getaccount", { address, visible: true })) as {
        balance?: bigint | number;
        frozenV2?: { type?: string; amount?: bigint | number }[];
        unfrozenV2?: {
          unfreeze_amount?: bigint | number;
          unfreeze_expire_time?: bigint | number;
        }[];
        votes?: { vote_address: string; vote_count: bigint | number }[];
      };
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
      const raw = (await post("/wallet/getaccountresource", { address, visible: true })) as {
        freeNetLimit?: bigint | number;
        freeNetUsed?: bigint | number;
        NetLimit?: bigint | number;
        NetUsed?: bigint | number;
      };
      const freeBandwidth = big(Math.max(0, num(raw.freeNetLimit) - num(raw.freeNetUsed)));
      const stakedBandwidth = big(Math.max(0, num(raw.NetLimit) - num(raw.NetUsed)));
      const resources: TronAccountResources = { freeBandwidth, stakedBandwidth };
      return resources;
    },
    async getReward(address) {
      const raw = (await post("/wallet/getReward", { address, visible: true })) as {
        reward?: bigint | number;
      };
      return big(raw.reward);
    },
    async listWitnesses() {
      const raw = (await post("/wallet/listwitnesses")) as {
        witnesses?: {
          address: string;
          voteCount?: bigint | number;
          url?: string;
          isJobs?: boolean;
        }[];
      };
      return (raw.witnesses ?? []).map<TronWitness>((w) => ({
        address: w.address,
        voteCount: big(w.voteCount),
        url: w.url ?? "",
        isSr: w.isJobs === true,
      }));
    },
    async getChainParameters() {
      const raw = (await post("/wallet/getchainparameters")) as {
        chainParameter?: { key: string; value?: bigint | number }[];
      };
      return Object.fromEntries((raw.chainParameter ?? []).map((p) => [p.key, num(p.value)]));
    },
    async getBrokerage(address) {
      const raw = (await post("/wallet/getbrokerage", { address, visible: true })) as {
        brokerage?: bigint | number;
      };
      return num(raw.brokerage);
    },
    async broadcast(signedTxJson) {
      const raw = (await post("/wallet/broadcasttransaction", JSON.parse(signedTxJson))) as {
        result?: boolean;
        txid?: string;
        code?: string;
        message?: string;
      };
      if (raw.result !== true && !raw.txid) {
        logger.error("Tron broadcast failed", { code: raw.code, message: raw.message });
        throw new ApiError(`Tron broadcast failed: ${raw.code ?? "unknown"}`, {
          type: "ServerResponseError",
        });
      }
      return raw.txid ?? "";
    },
  };
}
