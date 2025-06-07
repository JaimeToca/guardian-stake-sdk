"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BNBRpcClient = void 0;
const rpc_1 = require("../../common/rpc");
class BNBRpcClient {
    async getValidators() {
        const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/validator/all`;
        const response = await (0, rpc_1.fetchOrError)({
            url: requestUrl,
            method: "GET",
            params: {
                limit: BNBRpcClient.VALIDATORS_LIMIT,
                offset: BNBRpcClient.VALIDATORS_OFFSET,
            },
        });
        return response.data.validators;
    }
    async getStakingSummary() {
        const requestUrl = `${BNBRpcClient.BASE_MAINNET_URL}/summary`;
        const response = await (0, rpc_1.fetchOrError)({
            url: requestUrl,
            method: "GET",
        });
        return response.data.summary;
    }
}
exports.BNBRpcClient = BNBRpcClient;
BNBRpcClient.BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";
BNBRpcClient.VALIDATORS_LIMIT = "100";
BNBRpcClient.VALIDATORS_OFFSET = "0";
//# sourceMappingURL=bnb-rpc-client.js.map