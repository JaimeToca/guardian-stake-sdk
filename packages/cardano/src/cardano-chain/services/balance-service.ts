import type { Balance, BalanceServiceContract } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import { resolveStakeAddress } from "../validations";

/**
 * Cardano balance service.
 *
 * Cardano staking is fundamentally different from EVM staking:
 * - Tokens are NEVER locked when delegating — all ADA remains fully spendable.
 * - "Available" = total controlled amount (always spendable regardless of delegation).
 * - "Staked" = controlled amount when actively delegated to a pool; 0 otherwise.
 *   Only delegated ADA earns staking rewards — undelegated or unregistered accounts earn nothing.
 * - "Rewards" = accumulated rewards available for withdrawal (separate from main balance).
 */
export function createBalanceService(
  rpcClient: BlockfrostRpcClientContract
): BalanceServiceContract {
  return {
    async getBalances(address: string): Promise<Balance[]> {
      const account = await rpcClient.getAccount(resolveStakeAddress(address));

      const controlledAmount = BigInt(account.controlled_amount);
      const claimableRewards = BigInt(account.withdrawable_amount);
      const stakedAmount = account.pool_id ? controlledAmount : 0n;

      return [
        { type: "Available", amount: controlledAmount },
        { type: "Staked", amount: stakedAmount },
        { type: "Rewards", amount: claimableRewards },
      ];
    },
  };
}
