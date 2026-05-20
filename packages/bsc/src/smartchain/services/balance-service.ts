import type { Address, PublicClient } from "viem";
import type { Balance, BalanceServiceContract, StakingServiceContract } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

export function createBalanceService(
  client: PublicClient,
  stakingService: StakingServiceContract
): BalanceServiceContract {
  async function getPendingAndClaimableBalances(address: Address) {
    const { delegations } = await stakingService.getDelegations(address);

    return delegations.reduce(
      (acc, d) => {
        if (d.status === "Pending") acc.pendingBalance += d.amount;
        else if (d.status === "Claimable") acc.claimableBalance += d.amount;
        else if (d.status === "Active" || d.status === "Inactive") acc.stakedBalance += d.amount;
        return acc;
      },
      { stakedBalance: 0n, pendingBalance: 0n, claimableBalance: 0n }
    );
  }

  return {
    async getBalances(address: string): Promise<Balance[]> {
      const evmAddress = parseEvmAddress(address);

      const [availableBalance, staking] = await Promise.all([
        client.getBalance({ address: evmAddress }),
        getPendingAndClaimableBalances(evmAddress),
      ]);

      return [
        { type: "Available", amount: availableBalance },
        { type: "Staked", amount: staking.stakedBalance },
        { type: "Pending", amount: staking.pendingBalance },
        { type: "Claimable", amount: staking.claimableBalance },
      ];
    },
  };
}
