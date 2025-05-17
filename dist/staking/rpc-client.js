"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rpc_utils_1 = require("../utils/rpc-utils");
class RpcClient {
    getValidators() {
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
        return (0, rpc_utils_1.perform)(request).then((validatorResponse) => {
            console.log(validatorResponse);
            return validatorResponse.data.validators;
        });
    }
}
RpcClient.BASE_MAINNET_URL = "https://api.bnbchain.org/bnb-staking/v1/";
