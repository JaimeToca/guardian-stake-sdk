"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthersRpcClient = void 0;
const function_enconder_1 = require("../abi/function-enconder");
class EthersRpcClient {
    constructor(ethersProvider) {
        this.ethersProvider = ethersProvider;
    }
    async getValidatorsCreditContracts(contract) {
        const validatorsResponse = await this.ethersProvider.call({
            to: contract,
            data: (0, function_enconder_1.getValidatorsData)(),
        });
        console.log(validatorsResponse);
        const map = new Map();
        return map;
    }
    async getClaimableUnbondDelegation(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, function_enconder_1.claimableUnbondRequestData)(address),
        });
        console.log(validatorsResponse);
    }
    async getPendingUnbondDelegation(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, function_enconder_1.pendingUnbondRequestData)(address),
        });
        console.log(validatorsResponse);
    }
    async getPooledBNBData(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, function_enconder_1.getPooledBNBData)(address),
        });
        console.log(validatorsResponse);
    }
    async getSharesByPooledBNBData(contract, amount) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, function_enconder_1.getSharesByPooledBNBData)(amount),
        });
        console.log(validatorsResponse);
    }
}
exports.EthersRpcClient = EthersRpcClient;
//# sourceMappingURL=ethers-rpc-client.js.map