"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ethers_1 = require("ethers");
const ethers_rpc_client_1 = require("./smartchain/rpc/ethers-rpc-client");
console.log("Hello World");
test();
async function test() {
    let jsonProvider = new ethers_1.JsonRpcProvider("");
    let client = new ethers_rpc_client_1.EthersRpcClient(jsonProvider);
    let response = await client.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002");
    console.log(response);
}
//# sourceMappingURL=index.js.map