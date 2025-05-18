"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcClient = void 0;
const rpc_utils_1 = require("../../utils/rpc-utils");
class RpcClient {
    async getValidators() {
        const requestUrl = (0, rpc_utils_1.appendUrlParams)(RpcClient.BASE_MAINNET_URL + "/validator/all", {
            limit: RpcClient.VALIDATORS_LIMIT,
            offset: RpcClient.VALIDATORS_OFFSET,
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
exports.RpcClient = RpcClient;
RpcClient.BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";
RpcClient.VALIDATORS_LIMIT = "100";
RpcClient.VALIDATORS_OFFSET = "0";
//# sourceMappingURL=bnb-rpc-client.js.map