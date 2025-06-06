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

test();

async function test() {
  const bscRpcUrl =
    "https://bsc.twnodes.com";

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
  console.log(validators)

  let delegations = await stakingService.getDelegations(
    "0xB137d0B9bE423952a70A275bc8f2357038901CB2"
  );

  console.log(delegations)
//  console.log(delegations.delegations[0].status === DelegationStatus.Claimable)
//  console.log(delegations);
}
