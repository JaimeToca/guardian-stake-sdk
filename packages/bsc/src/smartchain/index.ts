import { createPublicClient, http } from "viem";
import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { createInMemoryCache, NoopLogger, validateRpcUrl } from "@guardian-sdk/sdk";
import { bscMainnet, getViemChain } from "../chain";
import { createStakingRpcClient } from "./rpc/staking-rpc-client";
import { createBnbRpcClient } from "./rpc/bnb-rpc-client";
import { createStakingService } from "./services/staking-service";
import { createSignService } from "./services/sign-service";
import { createFeeService } from "./services/fee-service";
import { createBalanceService } from "./services/balance-service";
import { getNonce } from "./services/nonce-service";
import { broadcast } from "./services/broadcast-service";

/**
 * Creates a GuardianServiceContract for BNB Smart Chain.
 * Pass the result directly to the `GuardianSDK` constructor.
 *
 * @example
 * ```typescript
 * import { GuardianSDK } from "@guardian-sdk/sdk";
 * import { bsc } from "@guardian-sdk/bsc";
 *
 * const sdk = new GuardianSDK([
 *   bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
 * ]);
 * ```
 */
export function bsc(config: { rpcUrl: string; logger?: Logger }): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  const client = createPublicClient({
    chain: getViemChain(bscMainnet),
    transport: http(config.rpcUrl),
    batch: { multicall: true },
  });

  const stakingRpc = createStakingRpcClient(client, logger);
  const bnbRpc = createBnbRpcClient(logger);
  const staking = createStakingService(
    createInMemoryCache<string, unknown>(),
    stakingRpc,
    bnbRpc,
    logger
  );
  const sign = createSignService(stakingRpc, logger);
  const fee = createFeeService(client, sign, logger);
  const balance = createBalanceService(client, staking);

  return {
    getChainInfo: () => bscMainnet,
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: (address) => getNonce(client, address),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast(client, logger, rawTx),
  };
}
