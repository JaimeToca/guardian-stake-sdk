import { GuardianChainIdentifier } from "../common/chain/chain-types";

export type SdkConfig = {
  chains: {
    [chain: GuardianChainIdentifier]: {
      rpcUrl: string;
      apiKey?: string;
    };
  };
};
