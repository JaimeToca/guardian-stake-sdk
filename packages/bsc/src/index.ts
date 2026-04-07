// Re-export everything from the chain-agnostic SDK core (includes GuardianSDK)
export * from "@guardian/sdk";

// BSC chain factory
export { bsc } from "./smartchain";

// BSC chain constants and registry
export { bscMainnet, chains, SUPPORTED_CHAINS } from "./chain";

// BSC-specific signing types
export { isSigningWithPrivateKey, isSigningWithAccount } from "./smartchain/sign-types";
export type { SigningWithAccount } from "./smartchain/sign-types";
