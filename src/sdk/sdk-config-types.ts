import { GuardianChainIdentifier } from "../common/chain/chain-types";

export type ChainConfig = {
  rpcUrl: string;
  apiKey?: string;
};

export type SdkConfig = {
  chains: {
    [chain_id: GuardianChainIdentifier]: ChainConfig;
  };
};