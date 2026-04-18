import type { Balance, BalanceServiceContract } from "@guardian-sdk/sdk";
import type { BlockfrostRpcClientContract } from "../rpc/blockfrost-rpc-client-contract";
import { resolveStakeAddress } from "../validations";

/**
 * Cardano balance service.
 *
 * Cardano staking is fundamentally different from EVM staking:
 * - Tokens are NEVER locked when delegating — all ADA remains fully spendable.
 * - "Staked" = total controlled amount (same as Available, since nothing is locked).
 * - "Claimable" = accumulated rewards available for withdrawal (separate from main balance).
 *
 * The `address` parameter should be a stake address (stake1...) which controls
 * the full wallet balance across all payment addresses sharing the same stake key.
 */
export class BalanceService implements BalanceServiceContract {
  constructor(private readonly rpcClient: BlockfrostRpcClientContract) {}

  async getBalances(address: string): Promise<Balance[]> {
    const account = await this.rpcClient.getAccount(resolveStakeAddress(address));

    const controlledAmount = BigInt(account.controlled_amount);
    const claimableRewards = BigInt(account.withdrawable_amount);

    return [
      // All ADA is available — delegation doesn't lock anything
      { type: "Available", amount: controlledAmount },
      // Staked = same as Available in Cardano (all ADA earns rewards passively)
      { type: "Staked", amount: controlledAmount },
      // Accumulated rewards ready to withdraw
      { type: "Rewards", amount: claimableRewards },
    ];
  }
}
