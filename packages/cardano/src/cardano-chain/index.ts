import type { GuardianChain, GuardianServiceContract, Logger, Validator } from "@guardian-sdk/sdk";
import { InMemoryCache, NoopLogger } from "@guardian-sdk/sdk";
import { BlockfrostRpcClient } from "./rpc/blockfrost-rpc-client";
import { StakingService } from "./services/staking-service";
import { BalanceService } from "./services/balance-service";
import { FeeService } from "./services/fee-service";
import { SignService } from "./services/sign-service";
import { NonceService } from "./services/nonce-service";
import { BroadcastService } from "./services/broadcast-service";
import { GuardianService } from "./services/guardian-service";

export function provideCardanoService(
  chain: GuardianChain,
  apiKey: string | undefined,
  logger: Logger
): GuardianServiceContract {
  const rpcClient = new BlockfrostRpcClient(apiKey, logger);
  const cache = new InMemoryCache<string, Validator[]>();

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
