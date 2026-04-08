import type { Chain } from "viem";
import { bsc } from "viem/chains";
import type { GuardianChain } from "@guardian-sdk/sdk";
import { ConfigError } from "@guardian-sdk/sdk";

/** BNB Smart Chain mainnet configuration. */
export const bscMainnet: GuardianChain = {
  id: "bsc-mainnet",
  type: "Smartchain",
  symbol: "BNB",
  decimals: 18,
  ecosystem: "Ethereum",
  chainId: "56",
  explorer: "https://bscscan.com",
};

/**
 * Registry of all chains supported by `@guardian-sdk/bsc`.
 * Use this for autocomplete — type `chains.` to see available chains.
 *
 * @example
 * ```typescript
 * import { chains } from "@guardian-sdk/bsc";
 * sdk.getValidators(chains.bscMainnet);
 * ```
 */
export const chains = {
  bscMainnet,
} as const;

/** All chains supported by `@guardian-sdk/bsc`. */
export const SUPPORTED_CHAINS: GuardianChain[] = [bscMainnet];

/** Retrieves a supported chain by its `id` string (e.g. `"bsc-mainnet"`). */
export const getChainById = (id: string): GuardianChain | undefined => {
  return Object.values(chains).find((chain) => chain.id === id);
};

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean => {
  return Object.values(chains).some(
    (supportedChain) => supportedChain.id === chain.id && supportedChain.chainId == chain.chainId
  );
};

/** Converts a GuardianChain to the corresponding viem Chain object. */
export const getViemChain = (chain: GuardianChain): Chain => {
  switch (chain.id) {
    case bscMainnet.id:
      return bsc;
    default:
      throw new ConfigError("UNSUPPORTED_CHAIN", `Chain not supported: "${chain.id}"`);
  }
};
