import type { GuardianChain } from "@guardian-sdk/sdk";

/** Solana mainnet configuration. */
export const solanaMainnet: GuardianChain = {
  id: "solana-mainnet",
  type: "Solana",
  symbol: "SOL",
  decimals: 9,
  ecosystem: "Solana",
  chainId: undefined,
  explorer: "https://explorer.solana.com",
};

export const chains = { solanaMainnet } as const;
export const SUPPORTED_CHAINS: GuardianChain[] = [solanaMainnet];
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((c) => c.id === id);
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some((c) => c.id === chain.id);
