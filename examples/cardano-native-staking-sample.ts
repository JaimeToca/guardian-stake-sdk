import { Bip32PrivateKey } from "@cardano-sdk/crypto";
import { mnemonicToEntropy } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { GuardianSDK, ConsoleLogger } from "@guardian-sdk/sdk";
import { cardano, chains } from "@guardian-sdk/cardano";
import type { CardanoSigningWithPrivateKey } from "@guardian-sdk/cardano";
import type {
  DelegateTransaction,
  RedelegateTransaction,
  UndelegateTransaction,
  ClaimRewardsTransaction,
} from "@guardian-sdk/sdk";

const { cardanoMainnet } = chains;

// Blockfrost API key — get one free at https://blockfrost.io
const sdk = new GuardianSDK([
  cardano({
    apiKey: process.env.BLOCKFROST_API_KEY ?? "",
    logger: new ConsoleLogger("debug"),
  }),
]);

// In Cardano, balances and delegations are queried via the stake address (stake1...).
// Transactions spend UTXOs from a payment address (addr1...).
// Both are derived from the same root key — see deriveKeysFromMnemonic() below.
const STAKE_ADDRESS = process.env.CARDANO_STAKE_ADDRESS ?? "stake1ux2f79kupeyy0n7cl8ddzewcgdamhh7xahz5y6uzv3u8lksa3dwn3";
const PAYMENT_ADDRESS = process.env.CARDANO_PAYMENT_ADDRESS ?? "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

// Raw Ed25519 private keys (32-byte hex). Set via environment variables — NEVER hardcode or commit.
// Derive from your mnemonic using deriveKeysFromMnemonic() below.
const PAYMENT_PRIVATE_KEY = process.env.CARDANO_PAYMENT_PRIVATE_KEY ?? "";
const STAKING_PRIVATE_KEY = process.env.CARDANO_STAKING_PRIVATE_KEY ?? "";

async function sample_check_delegations() {
  const balances = await sdk.getBalances(cardanoMainnet, STAKE_ADDRESS);
  console.log("Balances:", balances);

  const validators = await sdk.getValidators(cardanoMainnet);
  console.log(`Stake pools: ${validators.length}`);
  for (const v of validators) {
    console.log(`  ${v.name} — APY ≈ ${v.apy.toFixed(2)}% — delegators: ${v.delegators}`);
  }

  const { delegations, stakingSummary } = await sdk.getDelegations(cardanoMainnet, STAKE_ADDRESS);
  console.log("Staking summary:", stakingSummary);
  for (const d of delegations) {
    console.log(d);
  }
}

// Registers your stake key and delegates all ADA to a pool.
// Combines two certificates: StakeKeyRegistration + StakeDelegation.
// The 2 ADA deposit is returned when you later undelegate.
async function sample_delegate_transaction() {
  const validators = await sdk.getValidators(cardanoMainnet, "Active");
  const validator = validators.find((v) => v.name === "IOHK") ?? validators[0];

  const transaction: DelegateTransaction = {
    type: "Delegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  console.log(`Fee: ${Number(fee.total) / 1_000_000} ADA`);

  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };
  const rawTx = await sdk.sign(signingArgs);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Delegated: https://cardanoscan.io/transaction/${txHash}`);
}

// Switches delegation to a different pool without unbonding.
// No waiting period — takes effect at the next epoch boundary (~5 days).
async function sample_redelegate_transaction() {
  const validators = await sdk.getValidators(cardanoMainnet, "Active");
  const fromValidator = validators.find((v) => v.name === "IOHK") ?? validators[0];
  const toValidator = validators.find((v) => v.name !== fromValidator.name) ?? validators[1];

  const transaction: RedelegateTransaction = {
    type: "Redelegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    fromValidator,
    toValidator,
  };

  const fee = await sdk.estimateFee(transaction);
  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };
  const rawTx = await sdk.sign(signingArgs);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Redelegated: https://cardanoscan.io/transaction/${txHash}`);
}

// Deregisters your stake key and stops earning rewards.
// Returns the 2 ADA registration deposit. Your ADA stays in your wallet.
// Any pending rewards must be withdrawn first — they are lost on deregistration.
async function sample_undelegate_transaction() {
  const validators = await sdk.getValidators(cardanoMainnet);
  const validator = validators[0];

  const transaction: UndelegateTransaction = {
    type: "Undelegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };
  const rawTx = await sdk.sign(signingArgs);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Undelegated: https://cardanoscan.io/transaction/${txHash}`);
}

// Withdraws accumulated rewards to your payment address.
// Rewards accumulate in a separate reward account and must be claimed explicitly.
async function sample_claim_rewards() {
  const balances = await sdk.getBalances(cardanoMainnet, STAKE_ADDRESS);
  const rewards = balances.find((b) => b.type === "Rewards");

  if (!rewards || rewards.amount === 0n) {
    console.log("No rewards to claim.");
    return;
  }

  console.log(`Claiming ${Number(rewards.amount) / 1_000_000} ADA`);

  const validators = await sdk.getValidators(cardanoMainnet);

  const transaction: ClaimRewardsTransaction = {
    type: "ClaimRewards",
    chain: cardanoMainnet,
    amount: rewards.amount,
    account: PAYMENT_ADDRESS,
    validator: validators[0],
  };

  const fee = await sdk.estimateFee(transaction);
  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };
  const rawTx = await sdk.sign(signingArgs);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Claimed: https://cardanoscan.io/transaction/${txHash}`);
}

// For hardware wallets, MPC setups, or HSMs where you can't expose raw private keys:
// prehash() builds the unsigned tx body, compile() assembles the final tx from
// external signatures. The signature string is: paymentSig:stakingVKey:stakingSig:paymentVKey
async function sample_mpc_delegate() {
  const validators = await sdk.getValidators(cardanoMainnet, "Active");

  const transaction: DelegateTransaction = {
    type: "Delegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator: validators[0],
  };

  const fee = await sdk.estimateFee(transaction);
  const signArgs = { transaction, fee, nonce: 0 };

  const { serializedTransaction } = await sdk.preHash(signArgs);
  console.log("Tx body hash (sign this externally):", serializedTransaction);

  // Sign serializedTransaction externally, then compile:
  const paymentSigHex = "<128-char hex>";
  const paymentVKeyHex = "<64-char hex>";
  const stakingSigHex = "<128-char hex>";
  const stakingVKeyHex = "<64-char hex>";

  const rawTx = await sdk.compile({
    signArgs,
    signature: `${paymentSigHex}:${stakingVKeyHex}:${stakingSigHex}:${paymentVKeyHex}`,
  });

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted: https://cardanoscan.io/transaction/${txHash}`);
}

// Derives Cardano payment and staking private keys from a 24-word mnemonic.
// Uses CIP-1852 paths — compatible with Nami, Eternl, Lace, and all major wallets.
// NEVER log or commit the output of this function.
function deriveKeysFromMnemonic(mnemonic: string, passphrase = "", accountIndex = 0) {
  const harden = (n: number) => 0x80000000 + n;
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  const root = Bip32PrivateKey.fromBip39Entropy(Buffer.from(entropy), passphrase);
  return {
    paymentPrivateKey: root.derive([harden(1852), harden(1815), harden(accountIndex), 0, 0]).toRawKey().hex(),
    stakingPrivateKey: root.derive([harden(1852), harden(1815), harden(accountIndex), 2, 0]).toRawKey().hex(),
  };
}

sample_check_delegations();
