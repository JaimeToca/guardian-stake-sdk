"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BNBRpcClient = void 0;
const rpc_utils_1 = require("../../utils/rpc-utils");
class BNBRpcClient {
    async getValidators() {
        const requestUrl = (0, rpc_utils_1.appendUrlParams)(BNBRpcClient.BASE_MAINNET_URL + "/validator/all", {
            limit: BNBRpcClient.VALIDATORS_LIMIT,
            offset: BNBRpcClient.VALIDATORS_OFFSET,
        });
        const request = new Request(requestUrl, {
            method: "GET",
            headers: new Headers({
                "Content-Type": "application/json",
                "Accept": "application/json",
            }),
        });
        const validatorResponse = await (0, rpc_utils_1.fetchOrError)(request);
        return validatorResponse.data.validators;
    }
}
exports.BNBRpcClient = BNBRpcClient;
BNBRpcClient.BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";
BNBRpcClient.VALIDATORS_LIMIT = "100";
BNBRpcClient.VALIDATORS_OFFSET = "0";
//# sourceMappingURL=bnb-rpc-client.js.map