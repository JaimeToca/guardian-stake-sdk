import {
  CallParameters,
  createPublicClient,
  etherUnits,
  formatTransactionRequest,
  http,
  parseUnits,
} from "viem";
import { TransactionType } from "./common";
import { getSupportedChains, GuardianSDK } from "./sdk";
import { DelegateTransaction } from "./common/service/transaction-types";

sample();

async function sample() {
  const accountAddress = "0xB137d0B9bE423952a70A275bc8f2357038901CB2";
  console.log(accountAddress);

  // get supported chains by SDK
  const supportedChains = getSupportedChains();
  console.log(supportedChains);

  // BSC Chain
  const bscChain = supportedChains[0];
  console.log(bscChain);

  // Init SDK
  const guardianSDK = new GuardianSDK({
    chains: {
      [bscChain.id]: {
        rpcUrl: "https://bsc.twnodes.com",
      },
    },
  });

  // Get validators for staking
  const validators = await guardianSDK.getValidators(bscChain);
  console.log(validators);

  // Get all delegations (active, pending, claimable, inactive)
  const delegations = await guardianSDK.getDelegations(
    bscChain,
    accountAddress
  );
  console.log(delegations);

  // Fetch all types of balances
  const balances = await guardianSDK.getBalances(bscChain, accountAddress);
  console.log(balances);

  // Calculate fees for staking to first validator
  const delegateTransaction: DelegateTransaction = {
    type: TransactionType.Delegate,
    chain: bscChain,
    amount: parseUnits("1.0", 18),
    account: accountAddress,
    isMaxAmount: false,
    validator: validators[0],
  };
  const fees = await guardianSDK.estimateFee(delegateTransaction);
  console.log(fees);
}
