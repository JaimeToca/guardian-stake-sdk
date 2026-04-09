import type {
  BlockfrostAccount,
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
  getUtxos(paymentAddress: string): Promise<BlockfrostUtxo[]>;
  getProtocolParams(): Promise<BlockfrostProtocolParams>;
  getNetwork(): Promise<BlockfrostNetwork>;
  submitTx(cborHex: string): Promise<string>;
}
