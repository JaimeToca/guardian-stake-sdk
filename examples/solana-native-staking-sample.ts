import {
  GuardianSDK,
  chains,
  solana,
  ConsoleLogger,
  LAMPORTS_PER_SOL,
  type SolanaUndelegateTransaction,
  type SolanaClaimDelegateTransaction,
} from "@guardian-sdk/solana";
import type { DelegateTransaction, SigningWithPrivateKey, Transaction } from "@guardian-sdk/sdk";

const { solanaMainnet } = chains;

// JSON-RPC endpoint (public mainnet-beta, Helius, Triton, etc.).
const sdk = new GuardianSDK([
  solana({
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
    logger: new ConsoleLogger("debug"),
  }),
]);

// 32-byte Ed25519 seed as 64-char hex — NEVER hardcode or commit.
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY ?? "";
const ADDRESS = process.env.SOLANA_ADDRESS ?? "<your-base58-wallet>";
// Optional: pin a vote account; otherwise the sample picks the first Active validator.
const VOTE_ACCOUNT = process.env.SOLANA_VOTE_ACCOUNT;

/**
 * Estimate fee, nonce (always 0 on Solana), sign with the seed key, broadcast base64 wire tx.
 */
async function submit(transaction: Transaction): Promise<string> {
  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(solanaMainnet, ADDRESS);
  const signArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signArgs);
  return sdk.broadcast(solanaMainnet, rawTx);
}

// ── DELEGATE ──────────────────────────────────────────────────────────────────────────────────
// Create a seed-derived stake account, initialize, and DelegateStake to a vote account.
// amount is stake lamports; builder adds rent-exempt reserve. isMaxAmount must be false.
export async function stake(amountLamports: bigint, voteAccount: string): Promise<string> {
  const tx: DelegateTransaction = {
    type: "Delegate",
    chain: solanaMainnet,
    amount: amountLamports,
    isMaxAmount: false,
    validator: voteAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Delegated! https://explorer.solana.com/tx/${txHash}`);
  return txHash;
}

// ── UNDELEGATE ────────────────────────────────────────────────────────────────────────────────
// Deactivate the whole stake account. Requires stakeAccount (delegation.id from getDelegations).
// amount is ignored on-chain; pass 0n.
export async function undelegate(stakeAccount: string): Promise<string> {
  const tx: SolanaUndelegateTransaction = {
    type: "Undelegate",
    chain: solanaMainnet,
    amount: 0n,
    isMaxAmount: false,
    stakeAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Deactivated! https://explorer.solana.com/tx/${txHash}`);
  return txHash;
}

// ── CLAIM DELEGATE ────────────────────────────────────────────────────────────────────────────
// Withdraw full balance and close the stake account. Only succeeds when the stake is fully
// inactive (after deactivation cools down across epoch boundaries — often ~1 epoch wall time).
export async function claimDelegate(stakeAccount: string): Promise<string> {
  const tx: SolanaClaimDelegateTransaction = {
    type: "ClaimDelegate",
    chain: solanaMainnet,
    amount: 0n,
    stakeAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Withdrawn! https://explorer.solana.com/tx/${txHash}`);
  return txHash;
}

// ── READS ─────────────────────────────────────────────────────────────────────────────────────
export async function showValidators(): Promise<string> {
  const { data } = await sdk.getValidators(solanaMainnet, { page: 1, pageSize: 5 });
  console.log(
    "Validators (vote accounts):",
    data.map((v) => ({ id: v.id, status: v.status, apy: v.apy }))
  );
  const chosen = VOTE_ACCOUNT ?? data.find((v) => v.status === "Active")?.operatorAddress ?? data[0]?.operatorAddress;
  if (!chosen) {
    throw new Error("No validators returned — check RPC URL");
  }
  return chosen;
}

export async function showDelegations(label: string): Promise<void> {
  const { delegations } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  console.log(
    `${label}:`,
    delegations.map((d) => ({
      stakeAccount: d.id,
      status: d.status,
      amount: d.amount,
      seed: d.delegationIndex,
      validator: d.validator.id,
      pendingUntil: d.pendingUntil,
    }))
  );
}

export async function showBalances(): Promise<void> {
  const balances = await sdk.getBalances(solanaMainnet, ADDRESS);
  for (const b of balances) {
    console.log(b.type, Number(b.amount) / Number(LAMPORTS_PER_SOL), "SOL");
  }
}

// ── ORCHESTRATION ─────────────────────────────────────────────────────────────────────────────
// Full loop: pick vote account → Delegate → list positions → Undelegate.
// ClaimDelegate needs the stake to become fully inactive after deactivation (epoch wait).
export async function runFullLifecycle(): Promise<void> {
  if (!PRIVATE_KEY || ADDRESS.startsWith("<")) {
    console.error("Set SOLANA_PRIVATE_KEY and SOLANA_ADDRESS (and optionally SOLANA_RPC_URL / SOLANA_VOTE_ACCOUNT).");
    process.exitCode = 1;
    return;
  }

  const voteAccount = await showValidators();
  await showBalances();

  // Stake 0.1 SOL (plus rent-exempt reserve funded by the wallet on create).
  await stake(LAMPORTS_PER_SOL / 10n, voteAccount);
  await showDelegations("After Delegate (may show Active while still activating)");

  const { delegations } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  const position = delegations[0];
  if (!position) {
    throw new Error("No stake position found after Delegate");
  }

  await undelegate(position.id);
  await showDelegations("After Undelegate (Pending while deactivating)");

  // ── ClaimDelegate after epoch cooldown ────────────────────────────────────────────────────
  // Deactivation completes at an epoch boundary; wall time is roughly one epoch (~2–2.5 days
  // on mainnet). Poll getDelegations until status === "Claimable", then:
  //
  //   await claimDelegate(position.id);
  //
  // Rewards auto-compound into the stake account — there is no separate ClaimRewards op.
  console.log(
    [
      "Waiting for inactive stake before ClaimDelegate is not automated in this sample.",
      `When status is Claimable, call claimDelegate("${position.id}").`,
    ].join(" ")
  );
}

// For hardware wallets / MPC: prehash returns base64 *message bytes* (Ed25519 payload),
// not the wire transaction. compile expects base64 of the 64-byte signature.
export async function sampleMpcDelegate(voteAccount: string): Promise<void> {
  const delegate: DelegateTransaction = {
    type: "Delegate",
    chain: solanaMainnet,
    amount: LAMPORTS_PER_SOL / 10n,
    isMaxAmount: false,
    validator: voteAccount,
    account: ADDRESS,
  };

  const fee = await sdk.estimateFee(delegate);
  const nonce = await sdk.getNonce(solanaMainnet, ADDRESS);
  const signArgs = { transaction: delegate, fee, nonce };

  const { serializedTransaction } = await sdk.preHash(signArgs);
  console.log("Message bytes (base64) — sign externally with Ed25519:", serializedTransaction);

  const externalSignatureBase64 = "<base64-64-byte-ed25519-signature>";
  const rawTx = await sdk.compile({ signArgs, signature: externalSignatureBase64 });
  const txHash = await sdk.broadcast(solanaMainnet, rawTx);
  console.log(`Submitted: https://explorer.solana.com/tx/${txHash}`);
}

runFullLifecycle().catch((err) => {
  console.error("Lifecycle failed:", err);
  process.exitCode = 1;
});
