import { Chain } from "viem";
import { bsc } from "viem/chains";
import {
  ChainEcosystemType,
  GuardianChain,
  GuardianChainType,
} from "./chain-types";

export {
  GuardianChainType,
  ChainEcosystemType,
  GuardianChain,
} from "./chain-types";

export const SUPPORTED_CHAINS: GuardianChain[] = [
  {
    id: "bsc-mainnet",
    type: GuardianChainType.Smartchain,
    symbol: "BNB",
    decimals: 18,
    ecosystem: ChainEcosystemType.Ethereum,
    chainId: "56",
    explorer: "https://bscscan.com",
  },
];

export const isSupportedChain = (chain: GuardianChain): boolean => {
  return SUPPORTED_CHAINS.some(
    (supportedChain) =>
      supportedChain.id === chain.id && supportedChain.chainId == chain.chainId
  );
};

export const getViemChain = (chain: GuardianChain): Chain => {
  switch (chain.id) {
    case "bsc-mainnet":
      return bsc;
    default:
      throw new Error(`Chain not supported ${chain}`);
  }
};
