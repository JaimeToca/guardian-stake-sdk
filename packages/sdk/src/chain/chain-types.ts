export type GuardianChainIdentifier = string;

/**
 * The types of Guardian chains. Currently, only Smartchain is supported.
 */
export type GuardianChainType = "Smartchain";

/**
 * The broader blockchain ecosystem types.
 * Currently, only Ethereum is listed, though this could expand to include others like Polkadot, Solana, etc.
 */
export type ChainEcosystemType = "Ethereum"; // EVM-compatible chains

/**
 * Interface defining the structure for a Guardian chain.
 * This interface provides detailed information about a blockchain integrated into the Guardian SDK.
 */
export interface GuardianChain {
  id: GuardianChainIdentifier; // A unique identifier for the chain (e.g., "bsc-mainnet").
  type: GuardianChainType; // The specific type of Guardian chain, as defined in GuardianChainType enum.
  symbol: string; // The native currency symbol of the chain (e.g., "BNB" for Smartchain).
  decimals: number; // The number of decimal places for the chain's native currency.
  ecosystem: ChainEcosystemType; // The broader blockchain ecosystem this chain belongs to.
  chainId: string | undefined; // The chain ID, which is a unique identifier for a blockchain network. It can be undefined if not applicable or not yet set.
  explorer: string; // The URL of a blockchain explorer for this chain (e.g., "https://bscscan.com").
}
