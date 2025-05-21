"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const staking_rpc_client_1 = require("./smartchain/rpc/staking-rpc-client");
const staking_service_1 = require("./smartchain/services/staking-service");
const bnb_rpc_client_1 = require("./smartchain/rpc/bnb-rpc-client");
const in_memory_cache_1 = require("./smartchain/cache/in-memory-cache");
console.log("Hello World");
test();
async function test() {
    const bscRpcUrl = "https://bsc.twnodes.com/naas/session/ZjVhOWYwZjctYWQzNS00ODgxLTkzNDEtYjRhYTczYzIyMTNh";
    const client = (0, viem_1.createPublicClient)({
        chain: chains_1.bsc,
        transport: (0, viem_1.http)(bscRpcUrl),
        batch: {
            multicall: true,
        },
    });
    let client2 = new staking_rpc_client_1.StakingRpcClient(client);
    let client3 = new bnb_rpc_client_1.BNBRpcClient();
    let stakingService = new staking_service_1.StakingService(new in_memory_cache_1.InMemoryCache(), client2, client3);
    let validators = await stakingService.getValidators();
    let delegations = await stakingService.getDelegations("0x70568C52A154718e7aEDF825fc35A941C2A81a39");
    console.log(delegations);
}
//# sourceMappingURL=index.js.map