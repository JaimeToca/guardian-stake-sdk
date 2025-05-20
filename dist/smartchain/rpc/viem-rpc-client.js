"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViemRpcClient = void 0;
const staking_function_enconder_1 = require("../abi/staking-function-enconder");
const staking_function_decoder_1 = require("../abi/staking-function-decoder");
const abi_utils_1 = require("../abi/abi-utils");
class ViemRpcClient {
    constructor(client) {
        this.client = client;
    }
    async getValidatorsCreditContracts() {
        const validatorsResponse = await this.client.call({
            data: (0, staking_function_enconder_1.getValidatorsData)(),
            to: abi_utils_1.STAKING_CONTRACT,
        });
        if (!validatorsResponse.data) {
            throw new Error("Missing data for call getValidatorsCreditContracts(contract)");
        }
        const decodedReponse = (0, staking_function_decoder_1.decodeGetValidators)(validatorsResponse.data);
        const operatorAddresses = decodedReponse[0];
        const creditAddresses = decodedReponse[1];
        return new Map(operatorAddresses.map((operatorAddress, index) => {
            return [operatorAddress, creditAddresses[index]];
        }));
    }
    async getClaimableUnbondDelegation(contract, delegator) {
        const validatorsResponse = this.client.call({
            to: contract,
            data: (0, staking_function_enconder_1.claimableUnbondRequestData)(delegator),
        });
        console.log(validatorsResponse);
    }
    async getPendingUnbondDelegation(contract, delegator) {
        const validatorsResponse = this.client.call({
            to: contract,
            data: (0, staking_function_enconder_1.pendingUnbondRequestData)(delegator),
        });
        console.log(validatorsResponse);
    }
    async getPooledBNBData(contract, delegator) {
        const validatorsResponse = this.client.call({
            to: contract,
            data: (0, staking_function_enconder_1.getPooledBNBData)(delegator),
        });
        console.log(validatorsResponse);
    }
    async getSharesByPooledBNBData(contract, amount) {
        const validatorsResponse = this.client.call({
            to: contract,
            data: (0, staking_function_enconder_1.getSharesByPooledBNBData)(amount),
        });
        console.log(validatorsResponse);
    }
}
exports.ViemRpcClient = ViemRpcClient;
//# sourceMappingURL=viem-rpc-client.js.map