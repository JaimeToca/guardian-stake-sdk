import type { PublicClient } from "viem";
import { BNBRpcClient } from "./bnb-rpc-client";
import { StakingRpcClient } from "./staking-rpc-client";

export { StakingRpcClientContract } from "./staking-rpc-client-contract";
export { BNBRpcClientContract } from "./bnb-rpc-client-contract";
export { BNBChainValidator } from "./bnb-rpc-types";

export const bnbRpcClient = new BNBRpcClient();
export const stakingRpcClient = (client: PublicClient): StakingRpcClient => {
  return new StakingRpcClient(client);
};
