import type { TronAccount, TronAccountResources, TronWitness } from "./tron-rpc-types";

export interface TronRpcClientContract {
  getAccount(address: string): Promise<TronAccount>;
  getAccountResources(address: string): Promise<TronAccountResources>;
  getReward(address: string): Promise<bigint>;
  listWitnesses(): Promise<TronWitness[]>;
  getChainParameters(): Promise<Record<string, number>>;
  getBrokerage(address: string): Promise<number>;
  broadcast(signedTxJson: string): Promise<string>;
}
