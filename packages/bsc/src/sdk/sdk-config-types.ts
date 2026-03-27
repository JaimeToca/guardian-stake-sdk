/**
 * Defines the structure for the SDK configuration.
 */
export type SdkConfig = {
  chains: {
    [chainId: string]: {
      rpcUrl: string;
      apiKey?: string;
    };
  };
};
