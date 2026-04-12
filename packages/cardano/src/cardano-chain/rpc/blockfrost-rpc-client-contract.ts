import type {
  BlockfrostAccount,
  BlockfrostBlock,
  BlockfrostNetwork,
  BlockfrostPoolExtended,
  BlockfrostPoolMetadata,
  BlockfrostProtocolParams,
  BlockfrostUtxo,
} from "./blockfrost-rpc-types";

export interface BlockfrostRpcClientContract {
  getPools(page?: number): Promise<BlockfrostPoolExtended[]>;
  getPoolMetadata(poolId: string): Promise<BlockfrostPoolMetadata | null>;
  getAccount(stakeAddress: string): Promise<BlockfrostAccount>;
  /** Returns null when the stake address is not registered (404). */
  getAccountOrNull(stakeAddress: string): Promise<BlockfrostAccount | null>;
  getUtxos(paymentAddress: string): Promise<BlockfrostUtxo[]>;
  getProtocolParams(): Promise<BlockfrostProtocolParams>;
  getLatestBlock(): Promise<BlockfrostBlock>;
  getNetwork(): Promise<BlockfrostNetwork>;
  submitTx(cborHex: string): Promise<string>;
}
