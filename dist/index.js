"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const rpc_client_1 = require("./smartchain/rpc-client");
console.log("Hello World");
test();
async function test() {
    let client = new rpc_client_1.RpcClient();
    let response = await client.getValidators();
    response.forEach((validator) => {
        console.log(validator);
    });
}
//# sourceMappingURL=index.js.map