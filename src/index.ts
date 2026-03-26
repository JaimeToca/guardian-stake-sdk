// SDK
export { GuardianSDK, getSupportedChains } from "./sdk";
export type { SdkConfig } from "./sdk/sdk-config-types";

// Chain
export { BSC_CHAIN, GuardianChainType, ChainEcosystemType } from "./common/chain";
export type { GuardianChain } from "./common/chain";

// Staking types
export { BalanceType, TransactionType, ValidatorStatus, DelegationStatus, FeeType } from "./common";
export type {
  Balance,
  Fee,
  Transaction,
  OperatorAddress,
  Validator,
  Delegations,
  Delegation,
  StakingSummary,
} from "./common";

// Signing types
export { PrivateKey, Curve } from "./common";
export type {
  BaseSignArgs,
  SigningWithPrivateKey,
  CompileArgs,
  PrehashResult,
  HexString,
} from "./common";

// BSC-specific signing types (viem account-based signing)
export { isSigningWithPrivateKey, isSigningWithAccount } from "./smartchain/sign-types";
export type { SigningWithAccount } from "./smartchain/sign-types";
