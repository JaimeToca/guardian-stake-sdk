import { GuardianChainIdentifier } from "../common/chain/chain-types";

/**
 * Defines the structure for the SDK configuration.
 */
export type SdkConfig = {
  /**
   * An object where each key represents a blockchain identifier (e.g., 'Solana', 'Ethereum').
   * The value associated with each chain identifier is an object containing connection details for that chain.
   */
  chains: {
    [chain: GuardianChainIdentifier]: {
      /**
       * The URL of the Remote Procedure Call (RPC) endpoint for connecting to the blockchain.
       * This is a required string.
       */
      rpcUrl: string;
      /**
       * An optional API key required for accessing the RPC endpoint, if applicable.
       * This property may or may not be present.
       */
      apiKey?: string;
    };
  };
};
