import type { GuardianChain } from "@guardian-sdk/sdk";

/** Tron mainnet configuration. */
export const tronMainnet: GuardianChain = {
  id: "tron-mainnet",
  type: "Tron",
  symbol: "TRX",
  decimals: 6,
  ecosystem: "Tron",
  chainId: undefined,
  explorer: "https://tronscan.org",
};

export const chains = { tronMainnet } as const;
export const SUPPORTED_CHAINS: GuardianChain[] = [tronMainnet];
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((c) => c.id === id);
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some((c) => c.id === chain.id);
