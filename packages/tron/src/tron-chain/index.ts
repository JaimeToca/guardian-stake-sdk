import type { GuardianServiceContract, Logger, SigningWithPrivateKey } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl } from "@guardian-sdk/sdk";
import { tronMainnet } from "../chain";
import { createTronRpcClient } from "./rpc/tron-rpc-client";
import { createTronWebFactory } from "./tronweb/tronweb-factory";
import { createStakingService } from "./services/staking-service";
import { createBalanceService } from "./services/balance-service";
import { createFeeService } from "./services/fee-service";
import { createSignService } from "./services/sign-service";
import { createBroadcastService } from "./services/broadcast-service";

export interface TronConfig {
  rpcUrl: string;
  logger?: Logger;
}

/**
 * Creates a GuardianServiceContract for Tron. Pass the result to the `GuardianSDK` constructor.
 *
 * @example
 * const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]);
 */
export function tron(config: TronConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  const rpc = createTronRpcClient(config.rpcUrl, logger);
  const tronWebFactory = createTronWebFactory(config.rpcUrl);
  const staking = createStakingService(rpc, tronWebFactory.create);
  const balance = createBalanceService(rpc);
  const fee = createFeeService(rpc, staking);
  const sign = createSignService(tronWebFactory);
  const broadcast = createBroadcastService(rpc);

  return {
    getChainInfo: () => tronMainnet,
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: () => Promise.resolve(0),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args as SigningWithPrivateKey),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast.broadcast(rawTx),
  };
}
