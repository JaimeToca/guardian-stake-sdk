import type { Balance, BalanceServiceContract } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import { parseLovelaceString, resolveStakeAddress } from "../validations";

/**
 * Cardano balance service.
 *
 * Cardano staking is fundamentally different from EVM staking:
 * - Tokens are NEVER locked when delegating — all wallet ADA remains fully spendable.
 * - "Available" = wallet (UTXO) balance, always spendable regardless of delegation.
 * - "Staked" = the delegated wallet balance when actively delegated to a pool; 0 otherwise.
 *   Only delegated ADA earns staking rewards — undelegated/unregistered accounts earn nothing.
 * - "Rewards" = accumulated rewards sitting in the reward account, awaiting withdrawal.
 *
 * Blockfrost's `controlled_amount` is the *aggregate* controlled by the stake key —
 * it already includes `withdrawable_amount` (the rewards). We therefore subtract the
 * rewards out of Available/Staked so the three buckets don't double-count: the reward
 * balance is reported only under "Rewards", and `Available + Rewards` equals the total.
 */
export function createBalanceService(
  rpcClient: BlockfrostRpcClientContract
): BalanceServiceContract {
  return {
    async getBalances(address: string): Promise<Balance[]> {
      const account = await rpcClient.getAccount(resolveStakeAddress(address));

      const controlledAmount = parseLovelaceString(account.controlled_amount, "controlled_amount");
      const rewards = parseLovelaceString(account.withdrawable_amount, "withdrawable_amount");
      // Wallet (spendable) balance excludes rewards still held in the reward account.
      const walletAmount = controlledAmount - rewards;
      const stakedAmount = account.pool_id ? walletAmount : 0n;

      return [
        { type: "Available", amount: walletAmount },
        { type: "Staked", amount: stakedAmount },
        { type: "Rewards", amount: rewards },
      ];
    },
  };
}
