import {
  CallParameters,
  createPublicClient,
  formatTransactionRequest,
  http,
} from "viem";
import { bsc } from "viem/chains";
import { StakingRpcClient } from "./smartchain/rpc/staking-rpc-client";
import { StakingService } from "./smartchain/services/staking-service";
import { BNBRpcClient } from "./smartchain/rpc/bnb-rpc-client";
import { InMemoryCache } from "./smartchain/cache/in-memory-cache";

console.log("Hello World");

test();

async function test() {
  const bscRpcUrl =
    "https://bsc.twnodes.com/naas/session/ZjVhOWYwZjctYWQzNS00ODgxLTkzNDEtYjRhYTczYzIyMTNh";

  const client = createPublicClient({
    chain: bsc,
    transport: http(bscRpcUrl),
    batch: {
      multicall: true,
    },
  });

  let client2 = new StakingRpcClient(client);
  let client3 = new BNBRpcClient();

  let stakingService = new StakingService(
    new InMemoryCache(),
    client2,
    client3
  );

  let validators = await stakingService.getValidators();
  let delegations = await stakingService.getDelegations(
    "0x70568C52A154718e7aEDF825fc35A941C2A81a39"
  );
  console.log(delegations);

  /*validators.forEach(validator => {
  console.log(validator)
})
console.log(validators) */

  /*
let jsonProvider = new JsonRpcProvider("https://bsc.twnodes.com/naas/session/ZjU0NmVkYTAtY2NhYS00MzU4LWJiZWYtMjU4N2Y4OTNhN2Vi")
let client = new EthersRpcClient(jsonProvider);
let response = await client.getValidatorsCreditContracts("0x0000000000000000000000000000000000002002"); 
*/
}
