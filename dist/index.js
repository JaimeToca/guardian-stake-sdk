"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const viem_rpc_client_1 = require("./smartchain/rpc/viem-rpc-client");
const staking_service_1 = require("./smartchain/services/staking-service");
const bnb_rpc_client_1 = require("./smartchain/rpc/bnb-rpc-client");
console.log("Hello World");
test();
async function test() {
    const bscRpcUrl = 'https://bsc.twnodes.com';
    const client = (0, viem_1.createPublicClient)({
        chain: chains_1.bsc,
        transport: (0, viem_1.http)(bscRpcUrl),
    });
    let client2 = new viem_rpc_client_1.ViemRpcClient(client);
    let client3 = new bnb_rpc_client_1.BNBRpcClient();
    let stakingService = new staking_service_1.StakingService(client2, client3);
    let validators = await stakingService.getValidators();
    console.log(validators);
    console.log("response");
}
//# sourceMappingURL=index.js.map