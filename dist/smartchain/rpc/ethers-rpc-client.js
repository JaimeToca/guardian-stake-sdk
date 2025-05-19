"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EthersRpcClient = void 0;
const staking_function_enconder_1 = require("../abi/staking-function-enconder");
const staking_function_decoder_1 = require("../abi/staking-function-decoder");
class EthersRpcClient {
    constructor(ethersProvider) {
        this.ethersProvider = ethersProvider;
    }
    async getValidatorsCreditContracts(contract) {
        const validatorsResponse = await this.ethersProvider.call({
            to: contract,
            data: (0, staking_function_enconder_1.getValidatorsData)(),
        });
        const decodedReponse = (0, staking_function_decoder_1.decodeGetValidators)(validatorsResponse).toArray();
        const operatorAddresses = decodedReponse[0];
        const creditAddresses = decodedReponse[1];
        console.log(operatorAddresses);
        console.log(creditAddresses);
        const map = new Map();
        return map;
    }
    async getClaimableUnbondDelegation(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, staking_function_enconder_1.claimableUnbondRequestData)(address),
        });
        console.log(validatorsResponse);
    }
    async getPendingUnbondDelegation(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, staking_function_enconder_1.pendingUnbondRequestData)(address),
        });
        console.log(validatorsResponse);
    }
    async getPooledBNBData(contract, address) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, staking_function_enconder_1.getPooledBNBData)(address),
        });
        console.log(validatorsResponse);
    }
    async getSharesByPooledBNBData(contract, amount) {
        const validatorsResponse = this.ethersProvider.call({
            to: contract,
            data: (0, staking_function_enconder_1.getSharesByPooledBNBData)(amount),
        });
        console.log(validatorsResponse);
    }
}
exports.EthersRpcClient = EthersRpcClient;
//# sourceMappingURL=ethers-rpc-client.js.map