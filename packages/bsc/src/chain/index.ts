import type { Chain } from "viem";
import { bsc } from "viem/chains";
import type { GuardianChain } from "@guardian/sdk";

/** BNB Smart Chain mainnet configuration. */
export const BSC_CHAIN: GuardianChain = {
  id: "bsc-mainnet",
  type: "Smartchain",
  symbol: "BNB",
  decimals: 18,
  ecosystem: "Ethereum",
  chainId: "56",
  explorer: "https://bscscan.com",
};

/** All chains supported by `@guardian/bsc`. */
export const SUPPORTED_CHAINS: GuardianChain[] = [BSC_CHAIN];

/** Retrieves a supported chain by its `id` string (e.g. `"bsc-mainnet"`). */
export const getChainById = (id: string): GuardianChain | undefined => {
  return SUPPORTED_CHAINS.find((chain) => chain.id === id);
};

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean => {
  return SUPPORTED_CHAINS.some(
    (supportedChain) => supportedChain.id === chain.id && supportedChain.chainId == chain.chainId
  );
};

/** Converts a GuardianChain to the corresponding viem Chain object. */
export const getViemChain = (chain: GuardianChain): Chain => {
  switch (chain.id) {
    case "bsc-mainnet":
      return bsc;
    default:
      throw new Error(`Chain not supported ${chain.id}`);
  }
};
