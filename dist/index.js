"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
const viem_rpc_client_1 = require("./smartchain/rpc/viem-rpc-client");
console.log("Hello World");
test();
async function test() {
    const bscRpcUrl = 'https://bsc.twnodes.com';
    const client = (0, viem_1.createPublicClient)({
        chain: chains_1.bsc,
        transport: (0, viem_1.http)(bscRpcUrl),
    });
    let client2 = new viem_rpc_client_1.ViemRpcClient(client);
    let response = await client2.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002");
    console.log(response);
    console.log("response");
}
//# sourceMappingURL=index.js.map