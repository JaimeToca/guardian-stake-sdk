import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl, ValidationError } from "@guardian-sdk/sdk";
import { solanaMainnet } from "../chain";

export interface SolanaConfig {
  rpcUrl: string;
  logger?: Logger;
  defaultComputeUnitPrice?: bigint;
  seedScanGapLimit?: number;
  seedScanMax?: number;
  stakeCacheTtlMs?: number;
  validatorsCacheTtlMs?: number;
  enableGpaFallback?: boolean;
}

/**
 * Creates a GuardianServiceContract for Solana. Pass the result to the `GuardianSDK` constructor.
 *
 * Stub scaffold: service methods throw `UNSUPPORTED_OPERATION` until implemented.
 *
 * @example
 * const sdk = new GuardianSDK([solana({ rpcUrl: "https://api.mainnet-beta.solana.com" })]);
 */
export function solana(config: SolanaConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();
  void logger;

  const unsupported =
    (name: string) =>
    (..._args: unknown[]): never => {
      throw new ValidationError("UNSUPPORTED_OPERATION", `${name} not implemented yet`);
    };

  return {
    getChainInfo: () => solanaMainnet,
    getValidators: unsupported("getValidators"),
    getDelegations: unsupported("getDelegations"),
    getBalances: unsupported("getBalances"),
    getNonce: () => Promise.resolve(0),
    estimateFee: unsupported("estimateFee"),
    sign: unsupported("sign"),
    prehash: unsupported("prehash"),
    compile: unsupported("compile"),
    broadcast: unsupported("broadcast"),
  };
}
