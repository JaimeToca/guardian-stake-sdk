import type { TronAccount, TronWitness } from "./tron-rpc-types";

export interface TronRpcClientContract {
  getAccount(address: string): Promise<TronAccount>;
  getReward(address: string): Promise<bigint>;
  listWitnesses(): Promise<TronWitness[]>;
  getChainParameters(): Promise<Record<string, number>>;
  getBrokerage(address: string): Promise<number>;
  broadcast(signedTxJson: string): Promise<string>;
}
