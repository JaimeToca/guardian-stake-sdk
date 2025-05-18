import { JsonRpcProvider } from "ethers";
import { EthersRpcClient } from "./smartchain/rpc/ethers-rpc-client";

console.log("Hello World");

test();

async function test() {
  let jsonProvider = new JsonRpcProvider("https://bsc.twnodes.com/naas/session/ZjU0NmVkYTAtY2NhYS00MzU4LWJiZWYtMjU4N2Y4OTNhN2Vi")
  let client = new EthersRpcClient(jsonProvider);
  let response = await client.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002");

  console.log(response);
}
