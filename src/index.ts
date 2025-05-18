import { JsonRpcProvider } from "ethers";
import { EthersRpcClient } from "./smartchain/rpc/ethers-rpc-client";

console.log("Hello World");

test();

async function test() {
  let jsonProvider = new JsonRpcProvider("")
  let client = new EthersRpcClient(jsonProvider);
  let response = await client.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002");

  response.forEach((validator) => {
    console.log(validator)
  });
  console.log(response);
}
