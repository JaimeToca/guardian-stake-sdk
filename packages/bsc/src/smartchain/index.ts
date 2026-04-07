import { createPublicClient, http } from "viem";
import type { GuardianServiceContract, Validator, Logger } from "@guardian/sdk";
import { InMemoryCache, NoopLogger, validateRpcUrl } from "@guardian/sdk";
import type { GuardianChain } from "@guardian/sdk";
import { GuardianService } from "./services/guardian-service";
import { bscMainnet, getViemChain } from "../chain";
import { BalanceService } from "./services/balance-service";
import { StakingService } from "./services/staking-service";
import { BNBRpcClient } from "./rpc/bnb-rpc-client";
import { StakingRpcClient } from "./rpc/staking-rpc-client";
import { NonceService } from "./services/nonce-service";
import { FeeService } from "./services/fee-service";
import { SignService } from "./services/sign-service";
import { BroadcastService } from "./services/broadcast-service";

/**
 * Creates a GuardianServiceContract for BNB Smart Chain.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import { GuardianSDK } from "@guardian/sdk";
 * import { bsc, chains } from "@guardian/bsc";
 *
 * const sdk = new GuardianSDK([
 *   bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
 * ]);
 * ```
 */
export function bsc(config: { rpcUrl: string; logger?: Logger }): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  return provideGuarService(bscMainnet, config.rpcUrl, config.logger ?? new NoopLogger());
}

function provideGuarService(
  chain: GuardianChain,
  rpcUrl: string,
  logger: Logger
): GuardianServiceContract {
  const client = createPublicClient({
    chain: getViemChain(chain),
    transport: http(rpcUrl),
    batch: {
      multicall: true,
    },
  });
  const cache = new InMemoryCache<string, Validator[]>();
  const stakingRpcClient = new StakingRpcClient(client, logger);
  const bnbRpcClient = new BNBRpcClient(logger);
  const stakingService = new StakingService(cache, stakingRpcClient, bnbRpcClient, logger);

  const balanceService = new BalanceService(client, stakingService);
  const nonceService = new NonceService(client);
  const signService = new SignService(stakingRpcClient, logger);
  const feeService = new FeeService(client, signService, logger);
  const broadcastService = new BroadcastService(client, logger);

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
