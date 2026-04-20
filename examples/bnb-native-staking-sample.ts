import { parseUnits, toHex } from "viem";
import { HDKey } from "@scure/bip32";
import { mnemonicToSeedSync } from "@scure/bip39";
import { GuardianSDK, chains, bsc, ConsoleLogger } from "@guardian-sdk/bsc";
import type {
  ClaimDelegateTransaction,
  DelegateTransaction,
  RedelegateTransaction,
  UndelegateTransaction,
} from "@guardian-sdk/bsc";
import type { SigningWithPrivateKey } from "@guardian-sdk/sdk";

const { bscMainnet } = chains;

const sdk = new GuardianSDK([
  bsc({
    rpcUrl: "https://bsc.api.pocket.network", // public RPC — see https://chainlist.org/chain/56
    logger: new ConsoleLogger("debug"),
  }),
]);

async function sample_check_delegations() {
  const balances = await sdk.getBalances(bscMainnet, "0x166b6b8BFD51655cEA080Cc2C42fcB858645d29b");
  console.log("Balances:", balances);

  const validators = await sdk.getValidators(bscMainnet);
  console.log(`Validators: ${validators.length}`);

  const { delegations } = await sdk.getDelegations(bscMainnet, "0x166b6b8BFD51655cEA080Cc2C42fcB858645d29b");
  for (const d of delegations) {
    console.log(`${d.validator.name} | ${d.status} | ${d.amount} wei`);
  }
}

async function sample_delegate_transaction() {
  const MNEMONIC = "<your mnemonic>";
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18);

  const validators = await sdk.getValidators(bscMainnet);
  const validator = validators.find((v) => v.name === "Binance Staking") ?? validators[0];

  const transaction: DelegateTransaction = {
    type: "Delegate",
    chain: bscMainnet,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: false,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(bscMainnet, ADDRESS);

  const signingArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signingArgs);
  const txHash = await sdk.broadcast(bscMainnet, rawTx);
  console.log(`Delegated: https://bscscan.com/tx/${txHash}`);
}

async function sample_redelegate_transaction() {
  const MNEMONIC = "<your mnemonic>";
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18);

  const validators = await sdk.getValidators(bscMainnet);
  const fromValidator = validators.find((v) => v.name === "Binance Staking") ?? validators[0];
  const toValidator = validators.find((v) => v.name === "Ankr Staking") ?? validators[1];

  const transaction: RedelegateTransaction = {
    type: "Redelegate",
    chain: bscMainnet,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: true,
    fromValidator,
    toValidator,
  };

  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(bscMainnet, ADDRESS);

  const signingArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signingArgs);
  const txHash = await sdk.broadcast(bscMainnet, rawTx);
  console.log(`Redelegated: https://bscscan.com/tx/${txHash}`);
}

async function sample_undelegate_transaction() {
  const MNEMONIC = "<your mnemonic>";
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";
  const AMOUNT = parseUnits("1.01", 18);

  const validators = await sdk.getValidators(bscMainnet);
  const validator = validators.find((v) => v.name === "Ankr Staking") ?? validators[0];

  const transaction: UndelegateTransaction = {
    type: "Undelegate",
    chain: bscMainnet,
    amount: AMOUNT,
    account: ADDRESS,
    isMaxAmount: true,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(bscMainnet, ADDRESS);

  const signingArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signingArgs);
  const txHash = await sdk.broadcast(bscMainnet, rawTx);
  console.log(`Undelegated: https://bscscan.com/tx/${txHash}`);
}

// Claims BNB for all positions that have completed the 7-day unbonding period.
// Each undelegation has its own index — one claim transaction per position.
async function sample_claim_transaction() {
  const MNEMONIC = "<your mnemonic>";
  const PRIVATE_KEY = privateKeyFromMnemonic(MNEMONIC);
  const ADDRESS = "0x33CA16e244c86484c2637F290419af6808ac12B3";

  const { delegations } = await sdk.getDelegations(bscMainnet, ADDRESS);
  const claimable = delegations.filter((d) => d.status === "Claimable");

  if (claimable.length === 0) {
    console.log("No claimable positions.");
    return;
  }

  for (const delegation of claimable) {
    const transaction: ClaimDelegateTransaction = {
      type: "ClaimDelegate",
      chain: bscMainnet,
      amount: delegation.amount,
      account: ADDRESS,
      validator: delegation.validator,
      index: delegation.delegationIndex,
    };

    const fee = await sdk.estimateFee(transaction);
    const nonce = await sdk.getNonce(bscMainnet, ADDRESS);

    const signingArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
    const rawTx = await sdk.sign(signingArgs);
    const txHash = await sdk.broadcast(bscMainnet, rawTx);
    console.log(`Claimed (index ${delegation.delegationIndex}): https://bscscan.com/tx/${txHash}`);
  }
}

// Derives a BNB/EVM private key from a mnemonic using BIP-44 path m/44'/60'/0'/0/{index}.
// @scure/bip32 and @scure/bip39 ship as transitive dependencies of viem — no extra install needed.
function privateKeyFromMnemonic(mnemonic: string, addressIndex = 0): string {
  const seed = mnemonicToSeedSync(mnemonic);
  const child = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${addressIndex}`);
  if (!child.privateKey) throw new Error("Failed to derive private key");
  return toHex(child.privateKey);
}

sample_check_delegations();
