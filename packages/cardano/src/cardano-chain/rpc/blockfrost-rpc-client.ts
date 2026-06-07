import { fetchOrError, NoopLogger, ApiError, ConfigError } from "@guardian-sdk/sdk";
import { hexStringToBuffer } from "@cardano-sdk/util";
import type { Logger } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "./blockfrost-rpc-client-contract";
import type {
  BlockfrostAccount,
  BlockfrostBlock,
  BlockfrostNetwork,
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostProtocolParams,
  BlockfrostUtxo,
} from "./blockfrost-rpc-types";
import { parsePoolId } from "../validations";

/**
 * Client for the Blockfrost REST API (https://blockfrost.io).
 * All Cardano chain data queries go through this factory.
 *
 * Blockfrost requires an API key (project_id) obtained from blockfrost.io.
 */

const DEFAULT_BASE_URL = "https://cardano-mainnet.blockfrost.io/api/v0";
const DEFAULT_POOLS_PAGE_SIZE = 20;

function validateBaseUrl(url: string): void {
  try {
    const { protocol } = new URL(url);
    if (protocol !== "https:" && protocol !== "http:") {
      throw new ConfigError(
        "INVALID_RPC_URL",
        `Invalid baseUrl: only "https:" and "http:" protocols are allowed, got "${protocol}".`
      );
    }
  } catch (err) {
    if (err instanceof ConfigError) throw err;
    throw new ConfigError("INVALID_RPC_URL", `Invalid baseUrl: "${url}" is not a valid URL.`);
  }
}

export function createBlockfrostRpcClient(
  apiKey: string | undefined,
  logger: Logger = new NoopLogger(),
  baseUrl: string = DEFAULT_BASE_URL
): BlockfrostRpcClientContract {
  validateBaseUrl(baseUrl);
  const headers: Record<string, string> = apiKey ? { project_id: apiKey } : {};

  return {
    async getPools(
      page = 1,
      pageSize = DEFAULT_POOLS_PAGE_SIZE
    ): Promise<BlockfrostPoolExtended[]> {
      const url = `${baseUrl}/pools/extended`;
      logger.debug("BlockfrostRpcClient: fetching pools", { page, pageSize });
      const start = Date.now();

      const pools = await fetchOrError<BlockfrostPoolExtended[]>({
        url,
        method: "GET",
        headers,
        params: { count: pageSize, page },
      });

      logger.debug("BlockfrostRpcClient: pools fetched", {
        page,
        count: pools.length,
        ms: Date.now() - start,
      });
      return pools;
    },

    async getPool(poolId: string): Promise<BlockfrostPoolExtended> {
      parsePoolId(poolId);
      const url = `${baseUrl}/pools/${poolId}`;
      logger.debug("BlockfrostRpcClient: fetching pool", { poolId });

      return fetchOrError<BlockfrostPoolExtended>({ url, method: "GET", headers });
    },

    async getPoolMetadata(poolId: string): Promise<BlockfrostPoolMetadata | null> {
      parsePoolId(poolId);
      const url = `${baseUrl}/pools/${poolId}/metadata`;
      logger.debug("BlockfrostRpcClient: fetching pool metadata", { poolId });

      try {
        const metadata = await fetchOrError<BlockfrostPoolMetadata>({
          url,
          method: "GET",
          headers,
        });
        // Blockfrost returns {} (no pool_id field) when a pool has never registered metadata.
        return metadata.pool_id ? metadata : null;
      } catch (err) {
        // Blockfrost documents 404 for non-existent pools.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },

    async getAccount(stakeAddress: string): Promise<BlockfrostAccount> {
      const url = `${baseUrl}/accounts/${stakeAddress}`;
      logger.debug("BlockfrostRpcClient: fetching account", { stakeAddress });
      const start = Date.now();

      const account = await fetchOrError<BlockfrostAccount>({ url, method: "GET", headers });

      logger.debug("BlockfrostRpcClient: account fetched", {
        ms: Date.now() - start,
        poolId: account.pool_id,
        withdrawable: account.withdrawable_amount,
      });
      return account;
    },

    async getAccountOrNull(stakeAddress: string): Promise<BlockfrostAccount | null> {
      try {
        const url = `${baseUrl}/accounts/${stakeAddress}`;
        const account = await fetchOrError<BlockfrostAccount>({ url, method: "GET", headers });
        return account;
      } catch (err) {
        // In practice Blockfrost always returns 200 for valid stake addresses
        // (unregistered keys come back with active: false, registered: false).
        // 404 is a safety net for any edge case not covered by that behaviour.
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },

    async getUtxos(paymentAddress: string): Promise<BlockfrostUtxo[]> {
      const url = `${baseUrl}/addresses/${paymentAddress}/utxos`;
      logger.debug("BlockfrostRpcClient: fetching UTXOs", { paymentAddress });
      const start = Date.now();

      const utxos = await fetchOrError<BlockfrostUtxo[]>({
        url,
        method: "GET",
        headers,
        params: { count: 100, order: "desc" }, // Iterate with pagination if more than 100 UTXOs (unlikely for a payment address, but good to be safe)
      });

      logger.debug("BlockfrostRpcClient: UTXOs fetched", {
        count: utxos.length,
        ms: Date.now() - start,
      });
      return utxos;
    },

    async getProtocolParams(): Promise<BlockfrostProtocolParams> {
      const url = `${baseUrl}/epochs/latest/parameters`;
      logger.debug("BlockfrostRpcClient: fetching protocol params");

      const params = await fetchOrError<BlockfrostProtocolParams>({
        url,
        method: "GET",
        headers,
      });

      logger.debug("BlockfrostRpcClient: protocol params fetched", {
        epoch: params.epoch,
        minFeeA: params.min_fee_a,
        minFeeB: params.min_fee_b,
      });
      return params;
    },

    async getLatestBlock(): Promise<BlockfrostBlock> {
      const url = `${baseUrl}/blocks/latest`;
      logger.debug("BlockfrostRpcClient: fetching latest block");

      return fetchOrError<BlockfrostBlock>({ url, method: "GET", headers });
    },

    async getNetwork(): Promise<BlockfrostNetwork> {
      const url = `${baseUrl}/network`;
      logger.debug("BlockfrostRpcClient: fetching network info");

      return fetchOrError<BlockfrostNetwork>({ url, method: "GET", headers });
    },

    async submitTx(cborHex: string): Promise<string> {
      const url = `${baseUrl}/tx/submit`;
      logger.debug("BlockfrostRpcClient: submitting transaction");

      const txHash = await fetchOrError<string>({
        url,
        method: "POST",
        headers: { ...headers, "Content-Type": "application/cbor" },
        data: hexStringToBuffer(cborHex),
        responseType: "text",
      });

      logger.debug("BlockfrostRpcClient: transaction submitted", { txHash });
      return txHash;
    },
  };
}
