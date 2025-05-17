import { RpcClient } from "./smartchain/rpc-client";

console.log("Hello World");

test();

async function test() {
  let client = new RpcClient();
  let response = await client.getValidators();

  response.forEach((validator) => {
    console.log(validator)
  });
}
