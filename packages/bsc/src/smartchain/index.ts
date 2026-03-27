import type { PublicClient } from "viem";
import { createPublicClient, http } from "viem";
import type { GuardianServiceContract, StakingServiceContract, Validator, Logger } from "@guardian/sdk";
import { InMemoryCache, NoopLogger } from "@guardian/sdk";
import type { GuardianChain } from "@guardian/sdk";
import { GuardianService } from "./services/guardian-service";
import { BSC_CHAIN, getViemChain } from "../chain";
import { BalanceService } from "./services/balance-service";
import { StakingService } from "./services/staking-service";
import { BNBRpcClient } from "./rpc/bnb-rpc-client";
import { StakingRpcClient } from "./rpc/staking-rpc-client";
import { NonceService } from "./services/nonce-service";
import { FeeService } from "./services/fee-service";
import { SignService } from "./services/sign-service";

/**
 * Creates a GuardianServiceContract for BNB Smart Chain.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import { GuardianSDK } from "@guardian/sdk";
 * import { bsc, BSC_CHAIN } from "@guardian/bsc";
 *
 * const sdk = new GuardianSDK([
 *   bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
 * ]);
 * ```
 */
export function bsc(config: { rpcUrl: string; logger?: Logger }): GuardianServiceContract {
  return provideGuarService(BSC_CHAIN, config.rpcUrl, config.logger ?? new NoopLogger());
}

function provideGuarService(chain: GuardianChain, rpcUrl: string, logger: Logger): GuardianServiceContract {
  const client = createPublicClient({
    chain: getViemChain(chain),
    transport: http(rpcUrl),
    batch: {
      multicall: true,
    },
  });
  const stakingService = provideStakingService(client, logger);
  const balanceService = new BalanceService(client, stakingService);
  const nonceService = new NonceService(client);
  const signService = new SignService(logger);
  const feeService = new FeeService(client, signService, logger);

  return new GuardianService(
    chain,
    balanceService,
    nonceService,
    feeService,
    signService,
    stakingService
  );
}

function provideStakingService(client: PublicClient, logger: Logger): StakingServiceContract {
  const cache = new InMemoryCache<string, Validator[]>();
  const stakingRpcClient = new StakingRpcClient(client, logger);
  const bnbRpcClient = new BNBRpcClient(logger);
  return new StakingService(cache, stakingRpcClient, bnbRpcClient, logger);
}
