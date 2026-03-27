import { createPublicClient, http, PublicClient } from "viem";
import { GuardianServiceContract, InMemoryCache, StakingServiceContract, Validator } from "@guardian/sdk";
import { GuardianChain } from "@guardian/sdk";
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
export function bsc(config: { rpcUrl: string }): GuardianServiceContract {
  return provideGuarService(BSC_CHAIN, config.rpcUrl);
}

function provideGuarService(
  chain: GuardianChain,
  rpcUrl: string
): GuardianServiceContract {
  const client = createPublicClient({
    chain: getViemChain(chain),
    transport: http(rpcUrl),
    batch: {
      multicall: true,
    },
  });
  const stakingService = provideStakingService(client);
  const balanceService = new BalanceService(client, stakingService);
  const nonceService = new NonceService(client);
  const signService = new SignService();
  const feeService = new FeeService(client, signService);

  return new GuardianService(
    chain,
    balanceService,
    nonceService,
    feeService,
    signService,
    stakingService
  );
}

function provideStakingService(client: PublicClient): StakingServiceContract {
  const cache = new InMemoryCache<string, Validator[]>();
  const stakingRpcClient = new StakingRpcClient(client);
  const bnbRpcClient = new BNBRpcClient();
  return new StakingService(cache, stakingRpcClient, bnbRpcClient);
}
