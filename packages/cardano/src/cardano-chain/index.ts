import type { GuardianChain, GuardianServiceContract, Logger, Validator } from "@guardian-sdk/sdk";
import { InMemoryCache, NoopLogger } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../chain";
import { BlockfrostRpcClient } from "./rpc/blockfrost-rpc-client";
import { StakingService } from "./services/staking-service";
import { BalanceService } from "./services/balance-service";
import { FeeService } from "./services/fee-service";
import { SignService } from "./services/sign-service";
import { NonceService } from "./services/nonce-service";
import { BroadcastService } from "./services/broadcast-service";
import { GuardianService } from "./services/guardian-service";

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
  return provideCardanoService(
    cardanoMainnet,
    config.apiKey,
    config.logger ?? new NoopLogger(),
    config.baseUrl
  );
}

function provideCardanoService(
  chain: GuardianChain,
  apiKey: string | undefined,
  logger: Logger,
  baseUrl?: string
): GuardianServiceContract {
  const rpcClient = new BlockfrostRpcClient(apiKey, logger, baseUrl);
  const cache = new InMemoryCache<string, Validator[]>(600_000); // 10 min

  const stakingService = new StakingService(cache, rpcClient, logger);
  const balanceService = new BalanceService(rpcClient);
  const nonceService = new NonceService();
  const signService = new SignService(rpcClient, logger);
  const feeService = new FeeService(rpcClient, logger);
  const broadcastService = new BroadcastService(rpcClient, logger);

  return new GuardianService(
    chain,
    balanceService,
    nonceService,
    feeService,
    signService,
    stakingService,
    broadcastService
  );
}
