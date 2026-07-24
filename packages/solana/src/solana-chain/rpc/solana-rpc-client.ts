import type { Logger } from "@guardian-sdk/sdk";
import { ApiError, ApiErrorType, BroadcastError, NoopLogger } from "@guardian-sdk/sdk";
import {
  address,
  createSolanaRpc,
  getBase64Encoder,
  type Address,
  type Base58EncodedBytes,
  type Base64EncodedWireTransaction,
  type Commitment,
  type Slot,
  type TransactionMessageBytesBase64,
} from "@solana/kit";
import { fetchSysvarClock, fetchSysvarStakeHistory } from "@solana/sysvars";
import { STAKE_ACCOUNT_SPACE, STAKE_PROGRAM_ADDRESS } from "../state/constants";
import type { SolanaRpcClientContract } from "./solana-rpc-client-contract";
import type {
  InflationRate,
  SolanaAccountInfo,
  SolanaStakeProgramAccount,
  StakeHistoryEntry,
  Supply,
  VoteAccountInfo,
} from "./solana-rpc-types";

/** Solana RPC limit for `getMultipleAccounts` address lists. */
const GET_MULTIPLE_ACCOUNTS_MAX = 100;

/** Stake Meta layout: 4-byte enum disc + 8-byte rent_exempt_reserve → staker pubkey at offset 12. */
const STAKE_STAKER_MEMCMP_OFFSET = 12n;

/** Kit: base64 string → bytes. */
const base64Encoder = getBase64Encoder();

/**
 * Best-effort detection of an expired-blockhash RPC failure from the error text.
 * Matched substrings cover the common node/preflight phrasings.
 */
export function isBlockhashExpiredMessage(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("blockhash not found") ||
    m.includes("blockhashnotfound") ||
    m.includes("block height exceeded")
  );
}

function mapRpcError(err: unknown, operation: string): never {
  if (err instanceof ApiError || err instanceof BroadcastError) {
    throw err;
  }
  const message = err instanceof Error ? err.message : String(err);
  if (isBlockhashExpiredMessage(message)) {
    throw new BroadcastError(
      "BLOCKHASH_EXPIRED",
      `Solana ${operation} failed: recent blockhash expired — re-sign to embed a fresh blockhash and rebroadcast. (${message})`
    );
  }
  throw new ApiError(`Solana RPC ${operation} failed: ${message}`, {
    type: ApiErrorType.ServerResponseError,
    data: err,
  });
}

async function rpcCall<T>(operation: string, logger: Logger, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.error(`Solana RPC error: ${operation}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    mapRpcError(err, operation);
  }
}

function toAddress(value: string): Address {
  return address(value);
}

function decodeBase64Data(data: readonly [string, string] | string): Uint8Array {
  const b64 = typeof data === "string" ? data : data[0];
  return new Uint8Array(base64Encoder.encode(b64));
}

function mapVoteAccount(raw: {
  votePubkey: Address;
  nodePubkey: Address;
  activatedStake: bigint;
  commission: number;
  epochVoteAccount: boolean;
  lastVote: bigint;
  rootSlot: bigint;
  epochCredits: readonly (readonly [bigint, bigint, bigint])[];
}): VoteAccountInfo {
  return {
    votePubkey: raw.votePubkey,
    nodePubkey: raw.nodePubkey,
    activatedStake: raw.activatedStake,
    commission: raw.commission,
    epochVoteAccount: raw.epochVoteAccount,
    lastVote: raw.lastVote,
    rootSlot: raw.rootSlot,
    epochCredits: raw.epochCredits.map(
      ([epoch, credits, previousCredits]) => [epoch, credits, previousCredits] as const
    ),
  };
}

/**
 * Thin factory over `@solana/kit` `createSolanaRpc` + `@solana/sysvars`.
 * Service layer sees plain strings / bigints / `Uint8Array` only.
 */
export function createSolanaRpcClient(
  rpcUrl: string,
  logger: Logger = new NoopLogger()
): SolanaRpcClientContract {
  const rpc = createSolanaRpc(rpcUrl);

  return {
    getBalance(addr) {
      return rpcCall("getBalance", logger, async () => {
        const { value } = await rpc.getBalance(toAddress(addr)).send();
        return value;
      });
    },

    getLatestBlockhash() {
      return rpcCall("getLatestBlockhash", logger, async () => {
        const { value } = await rpc.getLatestBlockhash().send();
        return {
          blockhash: value.blockhash,
          lastValidBlockHeight: value.lastValidBlockHeight,
        };
      });
    },

    getEpochInfo() {
      return rpcCall("getEpochInfo", logger, async () => {
        const info = await rpc.getEpochInfo().send();
        return {
          epoch: info.epoch,
          slotIndex: info.slotIndex,
          slotsInEpoch: info.slotsInEpoch,
          absoluteSlot: info.absoluteSlot,
        };
      });
    },

    getVoteAccounts() {
      return rpcCall("getVoteAccounts", logger, async () => {
        const result = await rpc.getVoteAccounts().send();
        return {
          current: result.current.map(mapVoteAccount),
          delinquent: result.delinquent.map(mapVoteAccount),
        };
      });
    },

    getMultipleAccounts(addresses) {
      return rpcCall("getMultipleAccounts", logger, async () => {
        if (addresses.length === 0) {
          return [];
        }

        const out: Array<SolanaAccountInfo | null> = new Array(addresses.length).fill(null);

        for (let offset = 0; offset < addresses.length; offset += GET_MULTIPLE_ACCOUNTS_MAX) {
          const slice = addresses.slice(offset, offset + GET_MULTIPLE_ACCOUNTS_MAX);
          const addrs = slice.map(toAddress);
          const { value } = await rpc.getMultipleAccounts(addrs, { encoding: "base64" }).send();

          for (let i = 0; i < value.length; i++) {
            const account = value[i];
            const original = slice[i]!;
            if (account == null) {
              out[offset + i] = null;
              continue;
            }
            out[offset + i] = {
              address: original,
              lamports: account.lamports,
              data: decodeBase64Data(account.data),
              owner: account.owner,
            };
          }
        }

        return out;
      });
    },

    getMinimumBalanceForRentExemption(space) {
      return rpcCall("getMinimumBalanceForRentExemption", logger, async () => {
        return await rpc.getMinimumBalanceForRentExemption(BigInt(space)).send();
      });
    },

    getStakeMinimumDelegation() {
      return rpcCall("getStakeMinimumDelegation", logger, async () => {
        const { value } = await rpc.getStakeMinimumDelegation().send();
        return value;
      });
    },

    getFeeForMessage(messageBase64) {
      return rpcCall("getFeeForMessage", logger, async () => {
        const message = messageBase64 as TransactionMessageBytesBase64;
        const { value } = await rpc.getFeeForMessage(message).send();
        return value;
      });
    },

    getProgramAccountsStakeByStaker(staker) {
      return rpcCall("getProgramAccountsStakeByStaker", logger, async () => {
        const stakerAddr = toAddress(staker);
        const accounts = await rpc
          .getProgramAccounts(STAKE_PROGRAM_ADDRESS, {
            encoding: "base64",
            filters: [
              { dataSize: BigInt(STAKE_ACCOUNT_SPACE) },
              {
                memcmp: {
                  offset: STAKE_STAKER_MEMCMP_OFFSET,
                  bytes: stakerAddr as unknown as Base58EncodedBytes,
                  encoding: "base58",
                },
              },
            ],
          })
          .send();

        return accounts.map(
          (row): SolanaStakeProgramAccount => ({
            address: row.pubkey,
            lamports: row.account.lamports,
            data: decodeBase64Data(row.account.data),
          })
        );
      });
    },

    sendTransaction(wireTransactionBase64, options) {
      return rpcCall("sendTransaction", logger, async () => {
        const wire = wireTransactionBase64 as Base64EncodedWireTransaction;
        const config = {
          encoding: "base64" as const,
          ...(options?.skipPreflight !== undefined && { skipPreflight: options.skipPreflight }),
          ...(options?.preflightCommitment !== undefined && {
            preflightCommitment: options.preflightCommitment as Commitment,
          }),
          ...(options?.maxRetries !== undefined && { maxRetries: BigInt(options.maxRetries) }),
          ...(options?.minContextSlot !== undefined && {
            minContextSlot: options.minContextSlot as Slot,
          }),
        };
        const signature = await rpc.sendTransaction(wire, config).send();
        return signature;
      });
    },

    getStakeHistory() {
      return rpcCall("getStakeHistory", logger, async () => {
        const history = await fetchSysvarStakeHistory(rpc);
        // Sysvar is typically newest-first; sort defensively so callers can rely on it.
        const entries: StakeHistoryEntry[] = history.map((row) => ({
          epoch: row.epoch,
          effective: row.stakeHistory.effective,
          activating: row.stakeHistory.activating,
          deactivating: row.stakeHistory.deactivating,
        }));
        entries.sort((a, b) => (a.epoch < b.epoch ? 1 : a.epoch > b.epoch ? -1 : 0));
        return entries;
      });
    },

    getClock() {
      return rpcCall("getClock", logger, async () => {
        const clock = await fetchSysvarClock(rpc);
        return {
          epoch: BigInt(clock.epoch),
          unixTimestamp: BigInt(clock.unixTimestamp),
        };
      });
    },

    getClockEpoch() {
      return rpcCall("getClockEpoch", logger, async () => {
        const clock = await fetchSysvarClock(rpc);
        return BigInt(clock.epoch);
      });
    },

    getInflationRate(): Promise<InflationRate> {
      return rpcCall("getInflationRate", logger, async () => {
        const r = await rpc.getInflationRate().send();
        return {
          total: r.total,
          validator: r.validator,
          foundation: r.foundation,
          epoch: r.epoch,
        };
      });
    },

    getSupply(): Promise<Supply> {
      return rpcCall("getSupply", logger, async () => {
        const { value } = await rpc.getSupply({ excludeNonCirculatingAccountsList: true }).send();
        return { total: value.total, circulating: value.circulating };
      });
    },
  };
}
