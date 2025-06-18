import { Chain } from "viem";
import { bsc } from "viem/chains";
import {
  ChainEcosystemType,
  GuardianChain,
  GuardianChainType,
} from "./chain-types";

export {
  GuardianChainType,
  ChainEcosystemType,
  GuardianChain,
} from "./chain-types";

/**
 * @constant BSC_CHAIN
 * @description Represents the configuration for the Binance Smart Chain (BSC) mainnet.
 * This object defines various properties essential for interacting with BSC.
 */
export const BSC_CHAIN = {
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
 * @description An array containing all GuardianChain objects that are currently supported by the SDK.
 * New chains can be added to this array to extend support.
 */
export const SUPPORTED_CHAINS: GuardianChain[] = [BSC_CHAIN];

/**
 * @function getChainById
 * @description Retrieves a GuardianChain object from the list of supported chains based on its unique ID.
 * @param {string} id - The unique identifier of the chain to find (e.g., "bsc-mainnet").
 * @returns {GuardianChain | undefined} The GuardianChain object if found, otherwise `undefined`.
 */
export const getChainById = (id: string): GuardianChain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.id === id);
};

/**
 * @function isSupportedChain
 * @description Checks if a given GuardianChain object is present in the list of supported chains.
 * It verifies both the chain's `id` and `chainId` for a robust check.
 * @param {GuardianChain} chain - The GuardianChain object to check for support.
 * @returns {boolean} `true` if the chain is supported, `false` otherwise.
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
 * This is useful for integrating with libraries like Viem that expect specific chain objects.
 * @param {GuardianChain} chain - The GuardianChain object to convert.
 * @returns {Chain} The corresponding Viem Chain object.
 * @throws {Error} If the provided GuardianChain's ID is not recognized or supported for Viem conversion.
 */
export const getViemChain = (chain: GuardianChain): Chain => {
  switch (chain.id) {
    case "bsc-mainnet":
      return bsc;
    default:
      throw new Error(`Chain not supported ${chain}`);
  }
};
