import { GuardianSDK, ConsoleLogger } from "@guardian-sdk/sdk";
import { cardano, chains } from "@guardian-sdk/cardano";
import type { CardanoSigningWithPrivateKey } from "@guardian-sdk/cardano";
import type {
  DelegateTransaction,
  RedelegateTransaction,
  UndelegateTransaction,
  ClaimTransaction,
} from "@guardian-sdk/sdk";

const { cardanoMainnet } = chains;

/**
 * Configure the SDK with your Blockfrost API key.
 * Get a free key at https://blockfrost.io (50,000 req/day on the free tier).
 *
 * Omit `apiKey` when pointing at a self-hosted Blockfrost instance or proxy.
 */
const sdk = new GuardianSDK([
  cardano({
    apiKey: "",
    logger: new ConsoleLogger("debug"),
  }),
]);

/**
 * In Cardano, balances and delegations are queried via the *stake address* (stake1...).
 * Transactions are sent from a *payment address* (addr1...) which spends UTXOs.
 *
 * A typical wallet derives both from the same root key using the standard path:
 *   payment key → m/1852'/1815'/0'/0/0  (index 0)
 *   staking key  → m/1852'/1815'/0'/2/0
 *
 * Key management is outside the scope of this SDK — supply your own keys.
 */
const STAKE_ADDRESS = 
"stake1ux2f79kupeyy0n7cl8ddzewcgdamhh7xahz5y6uzv3u8lksa3dwn3";
const PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

/**
 * Ed25519 private keys as 64-char hex strings (32 bytes each).
 * Replace with your real keys — NEVER commit real keys to source control.
 */
const PAYMENT_PRIVATE_KEY = "<64-char hex payment private key>";
const STAKING_PRIVATE_KEY = "<64-char hex staking private key>";

/**
 * Demonstrates how to read staking data:
 * - getBalances:    available ADA, staked amount, claimable rewards
 * - getValidators:  list of active stake pools sorted by live stake
 * - getDelegations: current delegation and staking summary
 *
 * Note: in Cardano, staking never locks tokens. All ADA in the wallet earns
 * rewards passively while remaining fully spendable.
 */
async function sample_check_delegations() {
  const balances = await sdk.getBalances(cardanoMainnet, STAKE_ADDRESS);
  console.log("Balances:", balances);

  // Active stake pools sorted by live stake (first page of 100)
  const validators = await sdk.getValidators(cardanoMainnet);
  console.log(`Stake pools: ${validators.length} total`);

  for (const v of validators.slice(0, 3)) {
    console.log(`  ${v.name} — APY ≈ ${v.apy.toFixed(2)}% — delegators: ${v.delegators}`);
  }

  /*const { delegations, stakingSummary } = await sdk.getDelegations(
    cardanoMainnet,
    STAKE_ADDRESS
  );
  console.log("Staking summary:", stakingSummary);
  for (const d of delegations) {
    console.log(
      `  ${d.validator.name} (${d.validator.operatorAddress}) | status: ${d.status} | amount: ${d.amount} lovelaces`
    );
  } */
}

// ─── Delegate ─────────────────────────────────────────────────────────────────

/**
 * Registers your stake key and delegates all your ADA to a pool in one transaction.
 *
 * This combines two certificates:
 *   1. StakeKeyRegistration — locks the 2 ADA deposit (returned on deregistration)
 *   2. StakeDelegation      — points your stake to the chosen pool
 *
 * Rewards begin accruing after the current epoch boundary (~5 days).
 */
async function sample_delegate_transaction() {
  // Pick an active pool — use getValidators() to browse the full list
  const validators = await sdk.getValidators(cardanoMainnet, "Active");
  const validator = validators.find((v) => v.name === "IOHK") ?? validators[0];
  console.log(`Delegating to: ${validator.name} (${validator.operatorAddress})`);

  const transaction: DelegateTransaction = {
    type: "Delegate",
    chain: cardanoMainnet,
    amount: 0n, // Cardano delegates the full stake automatically — amount is not used
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator,
  };

  // Fee estimation builds a mock transaction to measure its byte size then applies:
  //   fee = min_fee_a × txSizeBytes + min_fee_b  (protocol parameters)
  const fee = await sdk.estimateFee(transaction);
  console.log(`Estimated fee: ${fee.total} lovelaces (${Number(fee.total) / 1_000_000} ADA)`);

  // Cardano is UTXO-based — no nonce. Pass nonce: 0 (it is ignored by the signing service).
  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };

  const rawTx = await sdk.sign(signingArgs);
  console.log(`Signed tx (CBOR hex): ${rawTx}`);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted tx hash: ${txHash}`);
}

// ─── Redelegate ───────────────────────────────────────────────────────────────

/**
 * Switches delegation to a different pool in a single transaction.
 *
 * Unlike EVM chains, there is no unbonding period and no fee beyond the
 * standard transaction fee — switching pools is instant after the epoch boundary.
 *
 * Only a StakeDelegation certificate is included (no deregistration + re-registration).
 */
async function sample_redelegate_transaction() {
  const validators = await sdk.getValidators(cardanoMainnet, "Active");
  const fromValidator = validators.find((v) => v.name === "IOHK") ?? validators[0];
  const toValidator = validators.find((v) => v.name !== fromValidator.name) ?? validators[1];
  console.log(`Redelegating from ${fromValidator.name} → ${toValidator.name}`);

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
  console.log(`Estimated fee: ${fee.total} lovelaces`);

  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };

  const rawTx = await sdk.sign(signingArgs);
  console.log(`Signed tx (CBOR hex): ${rawTx}`);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted tx hash: ${txHash}`);
}

// ─── Undelegate ───────────────────────────────────────────────────────────────

/**
 * Deregisters your stake key and stops earning staking rewards.
 *
 * Includes a StakeDeregistration certificate which returns the 2 ADA deposit
 * that was locked when you first registered your stake key.
 *
 * Your ADA remains in your wallet throughout — nothing is "unstaked" or locked.
 */
async function sample_undelegate_transaction() {
  const validators = await sdk.getValidators(cardanoMainnet);
  const validator = validators[0]; // the pool you're currently delegating to

  const transaction: UndelegateTransaction = {
    type: "Undelegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  console.log(`Estimated fee: ${fee.total} lovelaces`);

  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };

  const rawTx = await sdk.sign(signingArgs);
  console.log(`Signed tx (CBOR hex): ${rawTx}`);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted tx hash: ${txHash}`);
}

// ─── Claim (reward withdrawal) ────────────────────────────────────────────────

/**
 * Withdraws accumulated staking rewards to your payment address.
 *
 * The `amount` must match the exact withdrawable_amount from the account endpoint.
 * Check sdk.getBalances() for the Claimable balance before calling this.
 *
 * Rewards are sent to the payment address via a withdrawal in the tx body.
 * The staking key signature authorises the withdrawal.
 */
async function sample_claim_rewards() {
  const balances = await sdk.getBalances(cardanoMainnet, STAKE_ADDRESS);
  const claimable = balances.find((b) => b.type === "Claimable");

  if (!claimable || claimable.amount === 0n) {
    console.log("No rewards to claim.");
    return;
  }

  console.log(`Claiming ${claimable.amount} lovelaces (${Number(claimable.amount) / 1_000_000} ADA)`);

  const validators = await sdk.getValidators(cardanoMainnet);
  const validator = validators[0]; // any validator object — not used for Claim routing

  const transaction: ClaimTransaction = {
    type: "Claim",
    chain: cardanoMainnet,
    amount: claimable.amount,
    account: PAYMENT_ADDRESS,
    validator,
    index: 0n, // not used in Cardano — required by the shared Transaction type
  };

  const fee = await sdk.estimateFee(transaction);
  console.log(`Estimated fee: ${fee.total} lovelaces`);

  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction,
    fee,
    nonce: 0,
    paymentPrivateKey: PAYMENT_PRIVATE_KEY,
    stakingPrivateKey: STAKING_PRIVATE_KEY,
  };

  const rawTx = await sdk.sign(signingArgs);
  console.log(`Signed tx (CBOR hex): ${rawTx}`);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted tx hash: ${txHash}`);
}

// ─── MPC / Hardware wallet flow ───────────────────────────────────────────────

/**
 * For setups where you cannot expose raw private keys (hardware wallets, MPC, HSMs):
 *
 * 1. `prehash` — build the transaction body and return its CBOR hex for external signing.
 * 2. External signer signs the CBOR body hash (Blake2b-256) with both keys.
 * 3. `compile` — reassemble the final signed transaction from the external signatures.
 *
 * The `signature` field passed to `compile` must contain exactly four colon-delimited
 * hex strings in this order:
 *   paymentSigHex : stakingVKeyHex : stakingSigHex : paymentVKeyHex
 */
async function sample_mpc_delegate() {
  const validators = await sdk.getValidators(cardanoMainnet, "Active");
  const validator = validators[0];

  const transaction: DelegateTransaction = {
    type: "Delegate",
    chain: cardanoMainnet,
    amount: 0n,
    isMaxAmount: true,
    account: PAYMENT_ADDRESS,
    validator,
  };

  const fee = await sdk.estimateFee(transaction);
  const signArgs = { transaction, fee, nonce: 0 };

  // Step 1: build the unsigned transaction body
  const { serializedTransaction } = await sdk.preHash(signArgs);
  console.log("Unsigned tx body (CBOR hex):", serializedTransaction);
  // → hand serializedTransaction.hash (Blake2b-256) to your external signer

  // Step 2: external signer produces Ed25519 signatures and returns the public keys
  const paymentSigHex = "<128-char hex Ed25519 signature from payment key>";
  const paymentVKeyHex = "<64-char hex Ed25519 public payment key>";
  const stakingSigHex = "<128-char hex Ed25519 signature from staking key>";
  const stakingVKeyHex = "<64-char hex Ed25519 public staking key>";

  // Step 3: compile the signed transaction
  const compileSignature = `${paymentSigHex}:${stakingVKeyHex}:${stakingSigHex}:${paymentVKeyHex}`;
  const rawTx = await sdk.compile({ signArgs, signature: compileSignature });
  console.log(`Signed tx (CBOR hex): ${rawTx}`);

  const txHash = await sdk.broadcast(cardanoMainnet, rawTx);
  console.log(`Submitted tx hash: ${txHash}`);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

sample_check_delegations();
