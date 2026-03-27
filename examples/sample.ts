import { parseUnits } from "viem";
import { GuardianSDK, BSC_CHAIN, TransactionType } from "@guardian/bsc";

const sdk = new GuardianSDK({
  chains: {
    "56": { rpcUrl: "https://bsc.twnodes.com" },
  },
});

async function main() {
  
  // Fetch validators
  const validators = await sdk.getValidators(BSC_CHAIN);
  console.log("Validators:", validators);

  // Estimate fee for a delegate transaction
  const fee = await sdk.estimateFee({
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount: parseUnits("1.0", 18),
    account: "0xf8eb1dbab94aa705e2aaf734d7140ee3bb49cf0d",
    isMaxAmount: false,
    validator: validators[0],
  });
  console.log("Fee:", fee);

  // Fetch delegations for an address
  const delegations = await sdk.getDelegations(
    BSC_CHAIN,
    "0xB137d0B9bE423952a70A275bc8f2357038901CB2"
  );
  console.log("Delegations:", delegations);

  // Fetch balances
  const balances = await sdk.getBalances(
    BSC_CHAIN,
    "0xB137d0B9bE423952a70A275bc8f2357038901CB2"
  );
  console.log("Balances:", balances);
}

main();
