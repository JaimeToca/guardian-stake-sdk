"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalanceService = void 0;
const common_1 = require("../../common");
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
                type: common_1.BalanceType.Available,
                amount: availableBalance,
            },
            {
                type: common_1.BalanceType.Staked,
                amount: pendingDelegations.stakedBalance,
            },
            {
                type: common_1.BalanceType.Pending,
                amount: pendingDelegations.pendingBalance,
            },
            {
                type: common_1.BalanceType.Claimable,
                amount: pendingDelegations.claimableBalance,
            },
        ];
    }
    async getPendingAndClaimableBalances(address) {
        const delegationsInfo = await this.stakingService.getDelegations(address);
        return delegationsInfo.delegations.reduce((acc, delegation) => {
            if (delegation.status === common_1.DelegationStatus.Pending) {
                acc.pendingBalance += delegation.amount;
            }
            else if (delegation.status === common_1.DelegationStatus.Claimable) {
                acc.claimableBalance += delegation.amount;
            }
            else if (delegation.status === common_1.DelegationStatus.Active ||
                delegation.status === common_1.DelegationStatus.Inactive) {
                acc.stakedBalance += delegation.amount;
            }
            return acc;
        }, { stakedBalance: 0n, pendingBalance: 0n, claimableBalance: 0n });
    }
}
exports.BalanceService = BalanceService;
//# sourceMappingURL=balance-service.js.map