import { Address, PublicClient } from "viem";
import {
  Balance,
  BalanceServiceContract,
  BalanceType,
  DelegationStatus,
  StakingServiceContract,
} from "../../common";
import { checkIsValidAddress } from "../validations";

/**
 * Service class responsible for fetching and categorizing different types of token balances
 * for a given bnb address, including available, staked, pending, and claimable amounts.
 */
export class BalanceService implements BalanceServiceContract {
  /**
   * Constructs an instance of the BalanceService.
   * @param client The `PublicClient` instance used for interacting with
   * the blockchain node (e.g., fetching native token balance).
   * @param stakingService The `StakingServiceContract` instance used for retrieving detailed staking information,
   * which is necessary to determine staked, pending, and claimable balances.
   */
  constructor(
    private readonly client: PublicClient,
    private readonly stakingService: StakingServiceContract
  ) {}

  /**
   * Retrieves a comprehensive list of all relevant token balances for a specific address.
   * This includes the available (unlocked) balance, as well as balances related to staking activities
   * such as staked, pending, and claimable tokens.
   *
   * @param address The BNB `Address` for which to fetch the balances.
   * @returns A Promise that resolves to an array of `Balance` objects, each representing a different type of balance.
   */
  async getBalances(address: Address): Promise<Balance[]> {
    checkIsValidAddress(address);

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
        type: BalanceType.Available,
        amount: availableBalance,
      },
      {
        type: BalanceType.Staked,
        amount: pendingDelegations.stakedBalance,
      },
      {
        type: BalanceType.Pending,
        amount: pendingDelegations.pendingBalance,
      },
      {
        type: BalanceType.Claimable,
        amount: pendingDelegations.claimableBalance,
      },
    ];
  }

  /**
   * Private helper method to calculate the total staked, pending, and claimable balances
   * by iterating through the user's delegations.
   *
   * @param address The blockchain `Address` of the delegator.
   * @returns A Promise that resolves to an object containing the aggregated `stakedBalance`,
   * `pendingBalance`, and `claimableBalance` as `bigint` values.
   */
  private async getPendingAndClaimableBalances(address: Address): Promise<{
    stakedBalance: bigint;
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
        } else if (
          delegation.status === DelegationStatus.Active ||
          delegation.status === DelegationStatus.Inactive
        ) {
          acc.stakedBalance += delegation.amount;
        }
        return acc;
      },
      { stakedBalance: 0n, pendingBalance: 0n, claimableBalance: 0n }
    );
  }
}
