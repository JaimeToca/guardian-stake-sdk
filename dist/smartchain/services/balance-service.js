"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceService = void 0;
const balance_types_1 = require("./balance-types");
const staking_types_1 = require("./staking-types");
class BalanceService {
    constructor(client, stakingService) {
        this.client = client;
        this.stakingService = stakingService;
    }
    async getBalances(address) {
        const availableBalanceRequest = this.client.getBalance({
            address: address,
        });
        const pendingOrClaimableBalanceRequest = this.getPendingAndClaimableBalances(address);
        const [availableBalance, pendingDelegations] = await Promise.all([
            availableBalanceRequest,
            pendingOrClaimableBalanceRequest,
        ]);
        return [
            {
                type: balance_types_1.BalanceType.Available,
                amount: availableBalance,
            },
            {
                type: balance_types_1.BalanceType.Staked,
                amount: pendingDelegations.stakedBalance,
            },
            {
                type: balance_types_1.BalanceType.Pending,
                amount: pendingDelegations.pendingBalance,
            },
            {
                type: balance_types_1.BalanceType.Claimable,
                amount: pendingDelegations.claimableBalance,
            },
        ];
    }
    async getPendingAndClaimableBalances(address) {
        const delegationsInfo = await this.stakingService.getDelegations(address);
        return delegationsInfo.delegations.reduce((acc, delegation) => {
            if (delegation.status === staking_types_1.DelegationStatus.Pending) {
                acc.pendingBalance += delegation.amount;
            }
            else if (delegation.status === staking_types_1.DelegationStatus.Claimable) {
                acc.claimableBalance += delegation.amount;
            }
            else if (delegation.status === staking_types_1.DelegationStatus.Active ||
                delegation.status === staking_types_1.DelegationStatus.Inactive) {
                acc.stakedBalance += delegation.amount;
            }
            return acc;
        }, { stakedBalance: 0n, pendingBalance: 0n, claimableBalance: 0n });
    }
}
exports.BalanceService = BalanceService;
//# sourceMappingURL=balance-service.js.map