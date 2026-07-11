import type { Fee, Transaction } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

/**
 * Tron staking ops consume bandwidth (∝ tx size); energy ≈ 0. When free/available bandwidth
 * doesn't cover it, the shortfall is burned as TRX. This returns a conservative ResourceFee;
 * pure staking ops are typically free when the account holds staked bandwidth.
 */
export function createFeeService(rpc: TronRpcClientContract) {
  const APPROX_STAKING_TX_BANDWIDTH = 300n; // bytes; freeze/vote/withdraw are small, fixed-shape txs
  return {
    async estimateFee(_tx: Transaction): Promise<Fee> {
      const params = await rpc.getChainParameters();
      const bandwidthPrice = BigInt(params.getTransactionFee ?? 1000); // SUN per bandwidth point
      return {
        type: "ResourceFee",
        bandwidth: APPROX_STAKING_TX_BANDWIDTH,
        energy: 0n,
        total: APPROX_STAKING_TX_BANDWIDTH * bandwidthPrice, // worst-case TRX burn if no free bandwidth
      };
    },
  };
}
