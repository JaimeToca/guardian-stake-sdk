"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const staking_rpc_client_1 = require("./smartchain/rpc/staking-rpc-client");
const staking_service_1 = require("./smartchain/services/staking-service");
const bnb_rpc_client_1 = require("./smartchain/rpc/bnb-rpc-client");
const in_memory_cache_1 = require("./smartchain/cache/in-memory-cache");
test();
async function test() {
    const bscRpcUrl = "https://bsc.twnodes.com";
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
    console.log(validators);
    let delegations = await stakingService.getDelegations("0xB137d0B9bE423952a70A275bc8f2357038901CB2");
    console.log(delegations);
}
//# sourceMappingURL=index.js.map