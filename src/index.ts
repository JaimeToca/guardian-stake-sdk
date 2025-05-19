import { createPublicClient, http } from "viem";
import { bsc } from 'viem/chains'
import { ViemRpcClient } from "./smartchain/rpc/viem-rpc-client";

console.log("Hello World");

test();

async function test() {

const bscRpcUrl = 'https://bsc.twnodes.com'

const client = createPublicClient({
  chain: bsc,
  transport: http(bscRpcUrl),
})

let client2 = new ViemRpcClient(client);
let response = await client2.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002");
console.log(response);

/*let jsonProvider = new JsonRpcProvider("https://bsc.twnodes.com/naas/session/ZjU0NmVkYTAtY2NhYS00MzU4LWJiZWYtMjU4N2Y4OTNhN2Vi")
let client = new EthersRpcClient(jsonProvider);
let response = await client.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002"); */

  console.log("response");
}
