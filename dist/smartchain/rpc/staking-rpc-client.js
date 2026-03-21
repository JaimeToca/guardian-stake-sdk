"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StakingRpcClient = void 0;
const viem_1 = require("viem");
const abi_1 = require("../abi");
class StakingRpcClient {
    client;
    constructor(client) {
        this.client = client;
    }
    async getCreditContractValidators() {
        const validatorsResponse = await this.client.call({
            data: (0, abi_1.encodeGetValidatorsData)(),
            to: abi_1.STAKING_CONTRACT,
        });
        if (!validatorsResponse.data) {
            throw new Error("Missing data for call getValidatorsCreditContracts(contract)");
        }
        const decodedValidatorResponse = (0, abi_1.decodeGetValidators)(validatorsResponse.data);
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
                abi: abi_1.multicallStakeAbi,
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
                abi: abi_1.multicallStakeAbi,
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
            data: (0, abi_1.encodeUnbondRequestData)(delegator, index),
            to: creditContract,
        });
        if (!unbondRequestDataResponse.data) {
            throw new Error("Missing data for call getUnbondRequestData(delegator, index)");
        }
        const decodedUnbondResponse = (0, abi_1.decodeUnbond)(unbondRequestDataResponse.data);
        return {
            shares: decodedUnbondResponse[0],
            amount: decodedUnbondResponse[1],
            unlockTime: decodedUnbondResponse[2],
        };
    }
    async getSharesByPooledBNBData(creditContract, amount) {
        const response = await this.client.call({
            to: creditContract,
            data: (0, abi_1.encodeGetSharesByPooledBNBData)(amount),
        });
        if (!response.data)
            return undefined;
        const decoded = (0, viem_1.decodeAbiParameters)([{ name: "shares", type: "uint256" }], response.data);
        return decoded[0];
    }
}
exports.StakingRpcClient = StakingRpcClient;
//# sourceMappingURL=staking-rpc-client.js.map