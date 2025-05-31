import { Address, Chain, PublicClient } from "viem";
import { Balance } from "./balance-types";
import { BalanceServiceContract } from "./balance-service-contract";
import { StakingServiceContract } from "./staking-service-contract";
import { DelegationStatus } from "./staking-types";

export class BalanceService implements BalanceServiceContract {
  constructor(
    private readonly client: PublicClient,
    private readonly stakingService: StakingServiceContract
  ) {}

  async getBalances(chain: Chain, address: Address): Promise<Balance[]> {
    const availableBalanceRequest = this.client.getBalance({
      address: address,
    });

    const pendingOrClaimableBalanceRequest =
      this.getPendingAndClaimableBalances(address);

    const [availableBalance, pendingDelegations] = await Promise.all([
      availableBalanceRequest,
      pendingOrClaimableBalanceRequest,
    ]);

    return [
      {
        type: "available",
        amount: availableBalance,
      },
      {
        type: "pending",
        amount: pendingDelegations.pendingBalance,
      },
      {
        type: "claimable",
        amount: pendingDelegations.claimableBalance,
      },
    ];
  }

  private async getPendingAndClaimableBalances(address: Address): Promise<{
    pendingBalance: bigint;
    claimableBalance: bigint;
  }> {
    const delegationsInfo = await this.stakingService.getDelegations(address);
    
    return delegationsInfo.delegations.reduce(
      (acc, delegation) => {
        if (delegation.status === DelegationStatus.Pending) {
          acc.pendingBalance += delegation.amount;
        } else if (delegation.status === DelegationStatus.Claimable) {
          acc.claimableBalance += delegation.amount;
        }
        return acc;
      },
      { pendingBalance: 0n, claimableBalance: 0n }
    );
  }
}
