import { Chain } from "viem";
import { bsc } from "viem/chains";
import { ChainEcosystemType, GuardianChain, GuardianChainType } from "@guardian/sdk";

/**
 * @constant BSC_CHAIN
 * @description Represents the configuration for the Binance Smart Chain (BSC) mainnet.
 */
export const BSC_CHAIN: GuardianChain = {
  id: "bsc-mainnet",
  type: GuardianChainType.Smartchain,
  symbol: "BNB",
  decimals: 18,
  ecosystem: ChainEcosystemType.Ethereum,
  chainId: "56",
  explorer: "https://bscscan.com",
};

/**
 * @constant SUPPORTED_CHAINS
 * @description An array containing all GuardianChain objects supported by the BSC package.
 */
export const SUPPORTED_CHAINS: GuardianChain[] = [BSC_CHAIN];

/**
 * @function getChainById
 * @description Retrieves a GuardianChain object from the list of supported chains based on its unique ID.
 */
export const getChainById = (id: string): GuardianChain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.id === id);
};

/**
 * @function isSupportedChain
 * @description Checks if a given GuardianChain object is present in the list of supported chains.
 */
export const isSupportedChain = (chain: GuardianChain): boolean => {
  return SUPPORTED_CHAINS.some(
    (supportedChain) =>
      supportedChain.id === chain.id && supportedChain.chainId == chain.chainId
  );
};

/**
 * @function getViemChain
 * @description Converts a custom GuardianChain object into a Viem-compatible Chain object.
 */
export const getViemChain = (chain: GuardianChain): Chain => {
  switch (chain.id) {
    case "bsc-mainnet":
      return bsc;
    default:
      throw new Error(`Chain not supported ${chain.id}`);
  }
};
