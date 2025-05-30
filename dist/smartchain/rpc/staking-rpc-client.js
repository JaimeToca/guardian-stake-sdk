"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingRpcClient = void 0;
const staking_function_enconder_1 = require("../abi/staking-function-enconder");
const staking_function_decoder_1 = require("../abi/staking-function-decoder");
const stake_abi_1 = require("../abi/stake-abi");
class StakingRpcClient {
    constructor(client) {
        this.client = client;
    }
    async getCreditContractValidators() {
        const validatorsResponse = await this.client.call({
            data: (0, staking_function_enconder_1.encodeGetValidatorsData)(),
            to: StakingRpcClient.STAKING_CONTRACT,
        });
        if (!validatorsResponse.data) {
            throw new Error("Missing data for call getValidatorsCreditContracts(contract)");
        }
        const decodedValidatorResponse = (0, staking_function_decoder_1.decodeGetValidators)(validatorsResponse.data);
        const operatorAddresses = decodedValidatorResponse[0];
        const creditAddresses = decodedValidatorResponse[1];
        return new Map(operatorAddresses.map((operatorAddress, index) => {
            return [operatorAddress, creditAddresses[index]];
        }));
    }
    async getPooledBNBData(creditContracts, delegator) {
        const multicallContracts = creditContracts.map((creditContract) => {
            return {
                address: creditContract,
                abi: stake_abi_1.multicallStakeAbi,
                functionName: "getPooledBNB",
                args: [delegator],
            };
        });
        return this.client.multicall({
            contracts: multicallContracts,
            allowFailure: true,
        });
    }
    async getPendingUnbondDelegation(creditContracts, delegator) {
        const multicallContracts = creditContracts.map((creditContract) => {
            return {
                address: creditContract,
                abi: stake_abi_1.multicallStakeAbi,
                functionName: "pendingUnbondRequest",
                args: [delegator],
            };
        });
        return this.client.multicall({
            contracts: multicallContracts,
            allowFailure: true,
        });
    }
    async getUnbondRequestData(creditContract, delegator, index) {
        const unbondRequestDataResponse = await this.client.call({
            data: (0, staking_function_enconder_1.encodeUnbondRequestData)(delegator, index),
            to: creditContract,
        });
        if (!unbondRequestDataResponse.data) {
            throw new Error("Missing data for call getUnbondRequestData(delegator, index)");
        }
        const decodedUnbondResponse = (0, staking_function_decoder_1.decodeUnbond)(unbondRequestDataResponse.data);
        return {
            shares: decodedUnbondResponse[0],
            amount: decodedUnbondResponse[1],
            unlockTime: decodedUnbondResponse[2],
        };
    }
    async getSharesByPooledBNBData(creditContract, amount) {
        const validatorsResponse = this.client.call({
            to: creditContract,
            data: (0, staking_function_enconder_1.encodeGetSharesByPooledBNBData)(amount),
        });
        console.log(validatorsResponse);
    }
    async getClaimableUnbondDelegation(creditContract, delegator) {
        const validatorsResponse = this.client.call({
            to: creditContract,
            data: (0, staking_function_enconder_1.encodeClaimableUnbondRequestData)(delegator),
        });
        console.log(validatorsResponse);
    }
}
exports.StakingRpcClient = StakingRpcClient;
StakingRpcClient.STAKING_CONTRACT = "0x0000000000000000000000000000000000002002";
//# sourceMappingURL=staking-rpc-client.js.map