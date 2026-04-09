import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../chain";
import { provideCardanoService } from "../cardano-chain";

export interface CardanoConfig {
  /**
   * Blockfrost project API key for Cardano mainnet.
   * Obtain one at https://blockfrost.io — the free tier covers 50,000 requests/day.
   *
   * When omitted, requests are sent without authentication. This is useful for
   * self-hosted Blockfrost instances or proxies that do not require a key.
   */
  apiKey?: string;
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
    config.logger ?? new NoopLogger()
  );
}
