import type { GuardianServiceContract, Logger, SigningWithPrivateKey } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl } from "@guardian-sdk/sdk";
import { solanaMainnet } from "../chain";
import { createSolanaRpcClient } from "./rpc/solana-rpc-client";
import { createStakePositionCache } from "./state/stake-cache";
import { createBalanceService } from "./services/balance-service";
import { createBroadcastService } from "./services/broadcast-service";
import { createFeeService } from "./services/fee-service";
import { createSignService } from "./services/sign-service";
import { createStakingService } from "./services/staking-service";
import type { SolanaSendTransactionOptions } from "./tx/solana-types";

export interface SolanaConfig {
  rpcUrl: string;
  logger?: Logger;
  /** Priority fee: microlamports per CU. Defaults to 100_000 when unset; pass 0n to opt out. */
  defaultComputeUnitPrice?: bigint;
  seedScanGapLimit?: number;
  seedScanMax?: number;
  stakeCacheTtlMs?: number;
  validatorsCacheTtlMs?: number;
  enableGpaFallback?: boolean;
  /** JSON-RPC options forwarded to every `sendTransaction` (broadcast) call. */
  broadcastOptions?: SolanaSendTransactionOptions;
}

/**
 * Creates a GuardianServiceContract for Solana. Pass the result to the `GuardianSDK` constructor.
 *
 * @example
 * const sdk = new GuardianSDK([solana({ rpcUrl: "https://api.mainnet-beta.solana.com" })]);
 */
export function solana(config: SolanaConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  const rpc = createSolanaRpcClient(config.rpcUrl, logger);
  const stakeCache = createStakePositionCache(config.stakeCacheTtlMs);
  const serviceConfig = {
    seedScanGapLimit: config.seedScanGapLimit,
    seedScanMax: config.seedScanMax,
    enableGpaFallback: config.enableGpaFallback,
    validatorsCacheTtlMs: config.validatorsCacheTtlMs,
    defaultComputeUnitPrice: config.defaultComputeUnitPrice,
    stakeCacheTtlMs: config.stakeCacheTtlMs,
  };

  const staking = createStakingService(rpc, stakeCache, serviceConfig, logger);
  const balance = createBalanceService(rpc, stakeCache, serviceConfig, logger);
  const fee = createFeeService(rpc, serviceConfig, logger);
  const sign = createSignService(rpc, serviceConfig, logger);
  const broadcast = createBroadcastService(rpc, config.broadcastOptions, logger);

  return {
    getChainInfo: () => solanaMainnet,
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
