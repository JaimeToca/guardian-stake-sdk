import type { GuardianChain } from "@guardian-sdk/sdk";

/** Cardano mainnet configuration. */
export const cardanoMainnet: GuardianChain = {
  id: "cardano-mainnet",
  type: "Cardano",
  symbol: "ADA",
  decimals: 6, // 1 ADA = 1_000_000 lovelaces
  ecosystem: "Cardano",
  chainId: undefined, // Cardano uses network magic, not an integer chainId
  explorer: "https://cardanoscan.io",
};

/**
 * Registry of all chains supported by `@guardian-sdk/cardano`.
 *
 * @example
 * ```typescript
 * import { chains } from "@guardian-sdk/cardano";
 * sdk.getValidators(chains.cardanoMainnet);
 * ```
 */
export const chains = {
  cardanoMainnet,
} as const;

/** All chains supported by `@guardian-sdk/cardano`. */
export const SUPPORTED_CHAINS: GuardianChain[] = [cardanoMainnet];

/** Retrieves a supported chain by its `id` string (e.g. `"cardano-mainnet"`). */
export const getChainById = (id: string): GuardianChain | undefined => {
  return Object.values(chains).find((chain) => chain.id === id);
};

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean => {
  return Object.values(chains).some((supported) => supported.id === chain.id);
};
