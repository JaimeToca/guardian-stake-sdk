import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { createInMemoryCache, NoopLogger } from "@guardian-sdk/sdk";
import type { Validator } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../chain";
import { createBlockfrostRpcClient } from "./rpc/blockfrost-rpc-client";
import { createStakingService } from "./services/staking-service";
import { createBalanceService } from "./services/balance-service";
import { createFeeService } from "./services/fee-service";
import { createSignService } from "./services/sign-service";
import { createBroadcastService } from "./services/broadcast-service";

export interface CardanoConfig {
  /**
   * Blockfrost project API key for Cardano mainnet.
   * Obtain one at https://blockfrost.io — the free tier covers 50,000 requests/day.
   *
   * When omitted, requests are sent without authentication. This is useful for
   * self-hosted Blockfrost instances or proxies that do not require a key.
   */
  apiKey?: string;
  /**
   * Override the Blockfrost API base URL.
   * Defaults to "https://cardano-mainnet.blockfrost.io/api/v0".
   * Useful for self-hosted Blockfrost instances, testnet endpoints, or local proxies.
   *
   * @example "https://cardano-preprod.blockfrost.io/api/v0"
   */
  baseUrl?: string;
  logger?: Logger;
}

/**
 * Creates a GuardianServiceContract for Cardano.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import { GuardianSDK } from "@guardian-sdk/sdk";
 * import { cardano, chains } from "@guardian-sdk/cardano";
 *
 * const sdk = new GuardianSDK([
 *   cardano({ apiKey: "mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
 * ]);
 *
 * // Query stake pools
 * const pools = await sdk.getValidators(chains.cardanoMainnet);
 *
 * // Get delegations for a stake address
 * const delegations = await sdk.getDelegations(chains.cardanoMainnet, "stake1...");
 * ```
 */
export function cardano(config: CardanoConfig = {}): GuardianServiceContract {
  const logger = config.logger ?? new NoopLogger();
  const rpcClient = createBlockfrostRpcClient(config.apiKey, logger, config.baseUrl);
  const cache = createInMemoryCache<string, Validator[]>(600_000); // 10 min

  const staking = createStakingService(cache, rpcClient, logger);
  const balance = createBalanceService(rpcClient);
  const sign = createSignService(rpcClient, logger);
  const fee = createFeeService(rpcClient, logger);
  const broadcast = createBroadcastService(rpcClient, logger);

  return {
    getChainInfo: () => cardanoMainnet,
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: () => Promise.resolve(0), // Cardano uses UTXOs — no account nonce
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast.broadcast(rawTx),
  };
}
