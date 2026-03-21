"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stakingRpcClient = exports.bnbRpcClient = void 0;
const bnb_rpc_client_1 = require("./bnb-rpc-client");
const staking_rpc_client_1 = require("./staking-rpc-client");
exports.bnbRpcClient = new bnb_rpc_client_1.BNBRpcClient();
const stakingRpcClient = (client) => {
    return new staking_rpc_client_1.StakingRpcClient(client);
};
exports.stakingRpcClient = stakingRpcClient;
//# sourceMappingURL=index.js.map