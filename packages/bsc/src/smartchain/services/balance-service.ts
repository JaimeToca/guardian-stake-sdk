import type { Address, PublicClient } from "viem";
import type { Balance, BalanceServiceContract, StakingServiceContract } from "@guardian-sdk/sdk";
import { parseEvmAddress } from "../validations";

/**
 * Service class responsible for fetching and categorizing different types of token balances
 * for a given BNB address.
 */
export class BalanceService implements BalanceServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly stakingService: StakingServiceContract
  ) {}

  async getBalances(address: string): Promise<Balance[]> {
    const evmAddress = parseEvmAddress(address);

    const availableBalanceRequest = this.client.getBalance({
      address: evmAddress,
    });

    const pendingOrClaimableBalanceRequest = this.getPendingAndClaimableBalances(evmAddress);

    const [availableBalance, pendingDelegations] = await Promise.all([
      availableBalanceRequest,
      pendingOrClaimableBalanceRequest,
    ]);

    return [
      { type: "Available", amount: availableBalance },
      { type: "Staked", amount: pendingDelegations.stakedBalance },
      { type: "Pending", amount: pendingDelegations.pendingBalance },
      { type: "Claimable", amount: pendingDelegations.claimableBalance },
    ];
  }

  private async getPendingAndClaimableBalances(address: Address): Promise<{
    stakedBalance: bigint;
    pendingBalance: bigint;
    claimableBalance: bigint;
  }> {
    const delegationsInfo = await this.stakingService.getDelegations(address);

    return delegationsInfo.delegations.reduce(
      (acc, delegation) => {
        if (delegation.status === "Pending") {
          acc.pendingBalance += delegation.amount;
        } else if (delegation.status === "Claimable") {
          acc.claimableBalance += delegation.amount;
        } else if (delegation.status === "Active" || delegation.status === "Inactive") {
          acc.stakedBalance += delegation.amount;
        }
        return acc;
      },
      { stakedBalance: 0n, pendingBalance: 0n, claimableBalance: 0n }
    );
  }
}
