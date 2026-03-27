// Re-export everything from the chain-agnostic SDK core
export * from "@guardian/sdk";

// BSC-specific SDK
export { GuardianSDK, getSupportedChains } from "./sdk";
export type { SdkConfig } from "./sdk/sdk-config-types";

// BSC chain constants
export { BSC_CHAIN, SUPPORTED_CHAINS } from "./chain";

// BSC-specific signing types
export { isSigningWithPrivateKey, isSigningWithAccount } from "./smartchain/sign-types";
export type { SigningWithAccount } from "./smartchain/sign-types";
