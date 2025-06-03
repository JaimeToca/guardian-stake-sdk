"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeService = void 0;
const multicall_stake_abi_1 = require("../abi/multicall-stake-abi");
const utils_1 = require("viem/utils");
class FeeService {
    constructor(client, signService) {
        this.client = client;
        this.signService = signService;
    }
    async estimateFee(transaction) {
        const transactionAccount = transaction.account;
        const account = transactionAccount
            ? (0, utils_1.parseAccount)(transactionAccount)
            : undefined;
        const callDataResult = this.signService.buildCallData(transaction);
        const gasPricePromise = this.client.getGasPrice();
        const gasLimitPromise = this.client.estimateGas({
            account: account,
            to: multicall_stake_abi_1.STAKING_CONTRACT,
            value: callDataResult.amount,
            nonce: 0,
            data: callDataResult.data,
        });
        const [gasPrice, gasLimit] = await Promise.all([
            gasPricePromise,
            gasLimitPromise,
        ]);
        const increasedLimit = (gasLimit * BigInt(100 + 15)) / 100n;
        return {
            gasPrice: gasPrice,
            gasLimit: increasedLimit,
            total: gasPrice * gasLimit,
        };
    }
}
exports.FeeService = FeeService;
//# sourceMappingURL=fee-service.js.map