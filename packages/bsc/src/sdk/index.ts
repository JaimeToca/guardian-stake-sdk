import { getChainById, SUPPORTED_CHAINS } from "../chain";
import { GuardianChain } from "@guardian/sdk";
import { provideGuarService } from "../smartchain";
import {
  Balance,
  BaseSignArgs,
  CompileArgs,
  ConfigError,
  ConfigErrorCode,
  Delegations,
  Fee,
  GuardianServiceContract,
  PrehashResult,
  SigningWithPrivateKey,
  Transaction,
  Validator,
} from "@guardian/sdk";
import { SdkConfig } from "./sdk-config-types";

export * from "./sdk-config-types";

export function getSupportedChains(): GuardianChain[] {
  return SUPPORTED_CHAINS;
}

/**
 * @fileoverview The `GuardianSDK` class serves as the primary interface for interacting
 * with different blockchains. It abstracts away the complexities of blockchain interactions,
 * providing a consistent API for various operations across supported chains.
 */
export class GuardianSDK {
  private initializedServices: Map<string, GuardianServiceContract> = new Map();
  private config: SdkConfig;

  constructor(config: SdkConfig) {
    this.config = config;
  }

  getValidators(chain: GuardianChain): Promise<Validator[]> {
    const service = this.getInternalService(chain);
    return service.getValidators();
  }

  getDelegations(chain: GuardianChain, address: string): Promise<Delegations> {
    const service = this.getInternalService(chain);
    return service.getDelegations(address);
  }

  getBalances(chain: GuardianChain, address: string): Promise<Balance[]> {
    const service = this.getInternalService(chain);
    return service.getBalances(address);
  }

  getNonce(chain: GuardianChain, address: string): Promise<number> {
    const service = this.getInternalService(chain);
    return service.getNonce(address);
  }

  estimateFee(transaction: Transaction): Promise<Fee> {
    const chain = transaction.chain;
    return this.getInternalService(chain).estimateFee(transaction);
  }

  sign(signingArgs: SigningWithPrivateKey): Promise<string> {
    const chain = signingArgs.transaction.chain;
    return this.getInternalService(chain).sign(signingArgs);
  }

  preHash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    const chain = preHasArgs.transaction.chain;
    return this.getInternalService(chain).prehash(preHasArgs);
  }

  compile(compileArgs: CompileArgs): Promise<string> {
    const chain = compileArgs.signArgs.transaction.chain;
    return this.getInternalService(chain).compile(compileArgs);
  }

  private getInternalService(
    guardianChain: GuardianChain
  ): GuardianServiceContract {
    const chainId = guardianChain.chainId;
    if (chainId === undefined) {
      throw new ConfigError(
        ConfigErrorCode.MISSING_CHAIN_ID,
        "Cannot get blockchain service: chainId is undefined."
      );
    }

    if (this.initializedServices.has(chainId)) {
      return this.initializedServices.get(chainId)!;
    }

    const chain = getChainById(guardianChain.id);
    if (!chain) {
      throw new ConfigError(
        ConfigErrorCode.UNSUPPORTED_CHAIN,
        `Chain with ID "${chainId}" is not supported by the Guardian SDK. Please check 'getSupportedChains()'.`
      );
    }

    const serviceConfig = this.config.chains[chainId];
    if (!serviceConfig) {
      throw new ConfigError(
        ConfigErrorCode.MISSING_CHAIN_CONFIG,
        `Runtime configuration for chain "${chainId}" is missing in the provided SDK config. ` +
          `Please ensure 'sdkConfig.chains.${chainId}' is defined.`
      );
    }

    let guardianService: GuardianServiceContract;

    switch (chain.id) {
      case "bsc-mainnet":
        guardianService = provideGuarService(chain, serviceConfig.rpcUrl);
        break;
      default:
        throw new ConfigError(
          ConfigErrorCode.UNSUPPORTED_CHAIN,
          `No service implementation found for chain type: ${chain.type} (Chain ID: ${chainId}).`
        );
    }

    this.initializedServices.set(chainId, guardianService);
    return guardianService;
  }
}
