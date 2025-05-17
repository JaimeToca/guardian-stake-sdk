"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RpcClient = void 0;
const rpc_utils_1 = require("../utils/rpc-utils");
class RpcClient {
    async getValidators() {
        const requestUrl = (0, rpc_utils_1.buildUrl)(RpcClient.BASE_MAINNET_URL, "/validator/all", {
            limit: "100",
            offset: "0",
        });
        const request = new Request(requestUrl, {
            method: "GET",
            headers: new Headers({
                "Content-Type": "application/json",
                Accept: "application/json",
            }),
        });
        const validatorResponse = await (0, rpc_utils_1.perform)(request);
        return validatorResponse.data.validators;
    }
}
exports.RpcClient = RpcClient;
RpcClient.BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1";
//# sourceMappingURL=rpc-client.js.map