import { fetchOrError, NoopLogger } from "@guardian-sdk/sdk";
import { hexStringToBuffer } from "@cardano-sdk/util";
import type { Logger } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "./blockfrost-rpc-client-contract";
import type {
  BlockfrostAccount,
  BlockfrostNetwork,
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostProtocolParams,
  BlockfrostUtxo,
} from "./blockfrost-rpc-types";

/**
 * Client for the Blockfrost REST API (https://blockfrost.io).
 * All Cardano chain data queries go through this class.
 *
 * Blockfrost requires an API key (project_id) obtained from blockfrost.io.
 */
export class BlockfrostRpcClient implements BlockfrostRpcClientContract {
  private static readonly DEFAULT_BASE_URL = "https://cardano-mainnet.blockfrost.io/api/v0";
  private static readonly POOLS_PAGE_SIZE = 100;

  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string | undefined,
    private readonly logger: Logger = new NoopLogger(),
    baseUrl?: string
  ) {
    this.baseUrl = baseUrl ?? BlockfrostRpcClient.DEFAULT_BASE_URL;
  }

  private get headers(): Record<string, string> {
    return this.apiKey ? { project_id: this.apiKey } : {};
  }

  async getPools(page = 1): Promise<BlockfrostPoolExtended[]> {
    const url = `${this.baseUrl}/pools/extended`;
    this.logger.debug("BlockfrostRpcClient: fetching pools", { url, page });
    const start = Date.now();

    const pools = await fetchOrError<BlockfrostPoolExtended[]>({
      url,
      method: "GET",
      headers: this.headers,
      params: {
        count: BlockfrostRpcClient.POOLS_PAGE_SIZE, // 100 pools per page (max allowed by Blockfrost), till pagination is supported
        page,
        order: "desc", // most active first
      },
    });

    this.logger.debug("BlockfrostRpcClient: pools fetched", {
      count: pools.length,
      ms: Date.now() - start,
    });
    return pools;
  }

  async getPoolMetadata(poolId: string): Promise<BlockfrostPoolMetadata | null> {
    const url = `${this.baseUrl}/pools/${poolId}/metadata`;
    this.logger.debug("BlockfrostRpcClient: fetching pool metadata", { poolId });

    try {
      const metadata = await fetchOrError<BlockfrostPoolMetadata>({
        url,
        method: "GET",
        headers: this.headers,
      });
      return metadata;
    } catch {
      // Pool has no metadata (on-chain pools can omit metadata)
      return null;
    }
  }

  async getAccount(stakeAddress: string): Promise<BlockfrostAccount> {
    const url = `${this.baseUrl}/accounts/${stakeAddress}`;
    this.logger.debug("BlockfrostRpcClient: fetching account", { stakeAddress });
    const start = Date.now();

    const account = await fetchOrError<BlockfrostAccount>({
      url,
      method: "GET",
      headers: this.headers,
    });

    this.logger.debug("BlockfrostRpcClient: account fetched", {
      ms: Date.now() - start,
      poolId: account.pool_id,
      withdrawable: account.withdrawable_amount,
    });
    return account;
  }

  async getUtxos(paymentAddress: string): Promise<BlockfrostUtxo[]> {
    const url = `${this.baseUrl}/addresses/${paymentAddress}/utxos`;
    this.logger.debug("BlockfrostRpcClient: fetching UTXOs", { paymentAddress });
    const start = Date.now();

    const utxos = await fetchOrError<BlockfrostUtxo[]>({
      url,
      method: "GET",
      headers: this.headers,
      params: { count: 100, order: "desc" },
    });

    this.logger.debug("BlockfrostRpcClient: UTXOs fetched", {
      count: utxos.length,
      ms: Date.now() - start,
    });
    return utxos;
  }

  async getProtocolParams(): Promise<BlockfrostProtocolParams> {
    const url = `${this.baseUrl}/epochs/latest/parameters`;
    this.logger.debug("BlockfrostRpcClient: fetching protocol params");

    const params = await fetchOrError<BlockfrostProtocolParams>({
      url,
      method: "GET",
      headers: this.headers,
    });

    this.logger.debug("BlockfrostRpcClient: protocol params fetched", {
      epoch: params.epoch,
      minFeeA: params.min_fee_a,
      minFeeB: params.min_fee_b,
    });
    return params;
  }

  async getNetwork(): Promise<BlockfrostNetwork> {
    const url = `${this.baseUrl}/network`;
    this.logger.debug("BlockfrostRpcClient: fetching network info");

    return fetchOrError<BlockfrostNetwork>({
      url,
      method: "GET",
      headers: this.headers,
    });
  }

  async submitTx(cborHex: string): Promise<string> {
    const url = `${this.baseUrl}/tx/submit`;
    this.logger.debug("BlockfrostRpcClient: submitting transaction");

    const txHash = await fetchOrError<string>({
      url,
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/cbor",
      },
      data: hexStringToBuffer(cborHex),
    });

    this.logger.debug("BlockfrostRpcClient: transaction submitted", { txHash });
    return txHash;
  }
}
