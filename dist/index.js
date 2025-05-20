"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const staking_rpc_client_1 = require("./smartchain/rpc/staking-rpc-client");
const staking_service_1 = require("./smartchain/services/staking-service");
const bnb_rpc_client_1 = require("./smartchain/rpc/bnb-rpc-client");
console.log("Hello World");
test();
async function test() {
    const bscRpcUrl = '';
    const client = (0, viem_1.createPublicClient)({
        chain: chains_1.bsc,
        transport: (0, viem_1.http)(bscRpcUrl),
    });
    let client2 = new staking_rpc_client_1.StakingRpcClient(client);
    let client3 = new bnb_rpc_client_1.BNBRpcClient();
    let stakingService = new staking_service_1.StakingService(client2, client3);
    let validators = await stakingService.getValidators();
    validators.forEach(validator => {
        console.log(validator);
    });
    console.log(validators);
    console.log("response");
}
//# sourceMappingURL=index.js.map