// Re-export everything from the chain-agnostic SDK core (includes GuardianSDK)
export * from "@guardian-sdk/sdk";

// Cardano chain factory
export { cardano } from "./cardano-chain";
export type { CardanoConfig } from "./cardano-chain";

// Cardano chain constants and registry
export { cardanoMainnet, chains, SUPPORTED_CHAINS, getChainById, isSupportedChain } from "./chain";

// Cardano-specific signing types
export type { CardanoSigningWithPrivateKey, CardanoPrehashArgs } from "./cardano-chain/sign-types";
export { isCardanoSigningWithPrivateKey, isCardanoPrehashArgs } from "./cardano-chain/sign-types";
