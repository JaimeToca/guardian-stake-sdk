import {
  CallParameters,
  createPublicClient,
  etherUnits,
  formatTransactionRequest,
  http,
  parseUnits,
} from "viem";
import { bsc } from "viem/chains";
import { StakingRpcClient } from "./smartchain/rpc/staking-rpc-client";
import { StakingService } from "./smartchain/services/staking-service";
import { BNBRpcClient } from "./smartchain/rpc/bnb-rpc-client";
import { InMemoryCache } from "./common/cache/in-memory-cache";
import { BalanceService } from "./smartchain/services/balance-service";
import { FeeService } from "./smartchain/services/fee-service";
import { SignService } from "./smartchain/services/sign-service";
import { TransactionType } from "./common";
import { BSC_CHAIN } from "./common/chain";

test();

async function test() {
  const bscRpcUrl = "https://bsc.twnodes.com";

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

  let signService = new SignService();
  let feeService = new FeeService(client, signService);

  let validators = await stakingService.getValidators();
  console.log(validators)

  const feeResult = await feeService.estimateFee({
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount: parseUnits("1.0", 18),
    account: "0xf8eb1dbab94aa705e2aaf734d7140ee3bb49cf0d",
    isMaxAmount: false,
    validator: validators[0],
  });

  console.log(feeResult)

  //let delegations = await stakingService.getDelegations(
  //  "0xB137d0B9bE423952a70A275bc8f2357038901CB2"
  //);

  //console.log(delegations)
  //  console.log(delegations.delegations[0].status === DelegationStatus.Claimable)
  //  console.log(delegations);
}
