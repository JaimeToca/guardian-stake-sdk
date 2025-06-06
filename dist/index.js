"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const staking_rpc_client_1 = require("./smartchain/rpc/staking-rpc-client");
const staking_service_1 = require("./smartchain/services/staking-service");
const bnb_rpc_client_1 = require("./smartchain/rpc/bnb-rpc-client");
const in_memory_cache_1 = require("./smartchain/cache/in-memory-cache");
const fee_service_1 = require("./smartchain/services/fee-service");
const sign_service_1 = require("./smartchain/services/sign-service");
const transaction_types_1 = require("./smartchain/services/transaction-types");
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
    let signService = new sign_service_1.SignService();
    let feeService = new fee_service_1.FeeService(client, signService);
    let validators = await stakingService.getValidators();
    console.log(validators);
    const feeResult = await feeService.estimateFee({
        type: transaction_types_1.TransactionType.Delegate,
        chain: chains_1.bsc,
        amount: (0, viem_1.parseUnits)("1.0", 18),
        account: "0xf8eb1dbab94aa705e2aaf734d7140ee3bb49cf0d",
        isMaxAmount: false,
        validator: validators[0],
    });
    console.log(feeResult);
}
//# sourceMappingURL=index.js.map