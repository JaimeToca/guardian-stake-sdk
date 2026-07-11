import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
export function createBroadcastService(rpc: TronRpcClientContract) {
  return { broadcast: (rawTx: string): Promise<string> => rpc.broadcast(rawTx) };
}
