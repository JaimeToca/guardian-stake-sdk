import { Hex, isAddress, isHex } from "viem";
import { getChainById, GuardianChain, SUPPORTED_CHAINS } from "../common/chain";
import { GuardianServiceContract } from "../common/service/guardian-service-contract";
import { provideGuarService } from "../smartchain";
import {
  Balance,
  BaseSignArgs,
  CompileArgs,
  Fee,
  PrehashResult,
  SigningWithAccount,
  SigningWithPrivateKey,
  Transaction,
  Validator,
} from "../common";
import { SdkConfig } from "./sdk-config-types";

export * from "./sdk-config-types";

export function getSupportedChains(): GuardianChain[] {
  return SUPPORTED_CHAINS;
}

export class GuardianSDK {
  private initializedServices: Map<string, GuardianServiceContract> = new Map();
  private config: SdkConfig;

  constructor(config: SdkConfig) {
    this.config = config;
  }

  getValidators(chain: GuardianChain): Promise<Validator[]> {
    return this.getInternalService(chain).getValidators();
  }

  getDelegations(chain: GuardianChain, address: string) {
    if (!isAddress(address)) {
      throw Error("Invalid Address parameter");
    }
    return this.getInternalService(chain).getDelegations(address);
  }

  getBalances(chain: GuardianChain, address: string): Promise<Balance[]> {
    if (!isAddress(address)) {
      throw Error("Invalid Address parameter");
    }

    return this.getInternalService(chain).getBalances(address);
  }

  getNonce(chain: GuardianChain, address: string): Promise<number> {
    if (!isAddress(address)) {
      throw Error("Invalid Address parameter");
    }

    return this.getInternalService(chain).getNonce(address);
  }

  estimateFee(transaction: Transaction): Promise<Fee> {
    const chain = transaction.chain;

    return this.getInternalService(chain).estimateFee(transaction);
  }

  sign(
    signingArgs: SigningWithPrivateKey | SigningWithAccount
  ): Promise<string> {
    const chain = signingArgs.transaction.chain;

    return this.getInternalService(chain).sign(signingArgs);
  }

  preHash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    const chain = preHasArgs.transaction.chain;

    return this.getInternalService(chain).prehash(preHasArgs);
  }

  compile(compileArgs: CompileArgs): Promise<Hex> {
    const chain = compileArgs.signArgs.transaction.chain;

    return this.getInternalService(chain).compile(compileArgs);
  }

  private getInternalService(
    guardianChain: GuardianChain
  ): GuardianServiceContract {
    const chainId = guardianChain.chainId;
    if (chainId === undefined) {
      throw Error("Cannot get blockchain service, chaiId is undefined");
    }

    if (this.initializedServices.has(chainId)) {
      return this.initializedServices.get(chainId)!;
    }

    const chain = getChainById(chainId);
    if (!chain) {
      throw new Error(
        `Chain with ID "${chainId}" is not supported by the Guardian SDK. Please check 'getSupportedChains()'.`
      );
    }

    const serviceConfig = this.config.chains[chainId];
    if (!serviceConfig) {
      throw new Error(
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
        throw new Error(
          `Internal SDK Error: No service implementation mapping found for chain type: ${chain.type} (Chain ID: ${chainId})`
        );
    }

    this.initializedServices.set(chainId, guardianService);
    return guardianService;
  }
}
