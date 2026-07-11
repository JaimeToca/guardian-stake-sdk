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
  getPools(page?: number, pageSize?: number): Promise<BlockfrostPoolExtended[]>;
  getPool(poolId: string): Promise<BlockfrostPoolExtended>;
  getPoolMetadata(poolId: string): Promise<BlockfrostPoolMetadata | null>;
  getAccount(stakeAddress: string): Promise<BlockfrostAccount>;
  getAccountOrNull(stakeAddress: string): Promise<BlockfrostAccount | null>;
  getUtxos(paymentAddress: string, page?: number, count?: number): Promise<BlockfrostUtxo[]>;
  getProtocolParams(): Promise<BlockfrostProtocolParams>;
  getLatestBlock(): Promise<BlockfrostBlock>;
  getNetwork(): Promise<BlockfrostNetwork>;
  submitTx(cborHex: string): Promise<string>;
}
