/**
 * @guardian-sdk/solana — native staking, end to end.
 *
 * MENTAL MODEL
 * ────────────
 * Native staking is NOT "lock SOL in your wallet". SOL sits in a per-position **stake account**
 * owned by the Stake program. Your wallet is only the **authority** (fee payer = staker =
 * withdrawer in v1). Each Delegate creates a NEW stake account at a deterministic, seed-derived
 * address ("0", "1", "2", …) — you can't "top up" an existing one (Solana doesn't allow it).
 *
 * LIFECYCLE (epoch-driven; ~2–2.5 days/epoch on mainnet)
 *   Delegate     create + init + delegate → activating → active (at an epoch boundary)
 *   Undelegate   Deactivate (WHOLE account) → deactivating → inactive (after cooldown)
 *   ClaimDelegate Withdraw ALL + close the account → SOL back in the wallet
 *
 * REWARDS auto-compound into the stake account — there is NO ClaimRewards and NO "Rewards"
 * balance. A closed account's returned lamports already include everything accrued.
 *
 * UNITS: lamports. 1 SOL = 1_000_000_000 lamports (LAMPORTS_PER_SOL).
 */
import {
  GuardianSDK,
  chains,
  solana,
  ConsoleLogger,
  BroadcastError,
  LAMPORTS_PER_SOL,
  type SolanaUndelegateTransaction,
  type SolanaClaimDelegateTransaction,
} from "@guardian-sdk/solana";
import type {
  DelegateTransaction,
  Delegation,
  SigningWithPrivateKey,
  SolanaFee,
  Transaction,
} from "@guardian-sdk/sdk";

const { solanaMainnet } = chains;

// Single injected logger — used by the SDK and for all sample output (no direct console calls).
const logger = new ConsoleLogger("debug");

// ── SDK CONFIG ──────────────────────────────────────────────────────────────────────────────
// Every SolanaConfig knob is shown below. Only `rpcUrl` is required.
const sdk = new GuardianSDK([
  solana({
    // JSON-RPC endpoint (public mainnet-beta, Helius, Triton, QuickNode, your own node, …).
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",

    // Injected logger (ConsoleLogger / NoopLogger / your own). Omit for silence.
    logger,

    // Priority fee: microlamports per compute unit. DEFAULT 100_000 when omitted — so a Delegate
    // (~200k CU) pays ~20,000 lamports priority, an Undelegate/Claim (~50k CU) ~5,000. Pass 0n to
    // opt out entirely. Per-tx override is also possible (see `stakeWithPriority` below).
    defaultComputeUnitPrice: 100_000n,

    // Seed-scan discovery bounds (for getDelegations / getBalances). Scan stops after
    // `seedScanGapLimit` consecutive empty seeds, and never probes past `seedScanMax`.
    seedScanGapLimit: 5, // default 5
    seedScanMax: 50, // default 50

    // Cache TTLs. Positions are cached per-authority (shared by getDelegations & getBalances);
    // validators + APY inputs are cached separately.
    // Use 0 for this lifecycle sample so reads after Delegate/Undelegate always re-scan
    // (production UIs typically keep the 30s default and re-query after confirmation + TTL).
    stakeCacheTtlMs: 0,
    validatorsCacheTtlMs: 180_000, // default 3m

    // GPA fallback: also run getProgramAccounts to find stake accounts NOT on our seed scheme
    // (e.g. accounts created by the Solana CLI with random keypairs). Heavier RPC call, default
    // false. Enable it if you must surface pre-existing stake this SDK did not create.
    enableGpaFallback: true,

    // JSON-RPC options forwarded to every broadcast (sendTransaction). Config-only — they can't
    // ride the chain-agnostic broadcast(chain, rawTx) signature. With skipPreflight: true the node
    // won't report an expired blockhash synchronously (see submitWithBlockhashRetry below).
    broadcastOptions: {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 5,
      minContextSlot: 0n,
    },
  }),
]);

// 32-byte Ed25519 seed as 64-char hex — NEVER hardcode or commit. (Full 64-byte keygen arrays
// are out of scope in v1.) Single key: fee payer = staker = withdrawer.
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY ?? "";
const ADDRESS = process.env.SOLANA_ADDRESS ?? "<your-base58-wallet>";
// Optional: pin a vote account; otherwise the sample picks the first Active validator.
const VOTE_ACCOUNT = process.env.SOLANA_VOTE_ACCOUNT;

/**
 * Estimate fee → nonce (always 0 on Solana) → sign with the seed key → broadcast base64 wire tx.
 * Every write action funnels through here so the per-action functions stay focused on building
 * just their transaction.
 */
async function submit(transaction: Transaction): Promise<string> {
  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(solanaMainnet, ADDRESS); // recent blockhash lives in tx build → 0
  const signArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signArgs);
  return sdk.broadcast(solanaMainnet, rawTx);
}

/**
 * Same as submit(), but resilient to blockhash expiration. A signed tx embeds a recent blockhash
 * that expires in ~60–90s; if broadcasting an expired tx (with preflight ON) the SDK throws a
 * BroadcastError { code: "BLOCKHASH_EXPIRED" }. The SDK does NOT auto-retry — we catch it here,
 * re-sign() (fetches a fresh blockhash + re-signs), and rebroadcast. For MPC, re-run the
 * preHash → external-sign → compile steps in the catch instead. NOTE: with skipPreflight: true the
 * node won't report expiration synchronously — use getSignatureStatuses to confirm and retry.
 */
export async function submitWithBlockhashRetry(
  transaction: Transaction,
  maxAttempts = 3
): Promise<string> {
  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(solanaMainnet, ADDRESS);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const signArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
    const rawTx = await sdk.sign(signArgs); // fresh blockhash each attempt
    try {
      return await sdk.broadcast(solanaMainnet, rawTx);
    } catch (err) {
      const expired = err instanceof BroadcastError && err.code === "BLOCKHASH_EXPIRED";
      if (expired && attempt < maxAttempts) {
        logger.info(`Blockhash expired (attempt ${attempt}) — re-signing and retrying`);
        continue;
      }
      throw err;
    }
  }
  throw new Error("exhausted blockhash retries");
}

/** Solana charges ceil(CU × microlamports-per-CU / 1e6) lamports for priority fees. */
function priorityFeeLamportsCeil(computeUnits: bigint, computeUnitPrice: bigint): bigint {
  if (computeUnits <= 0n || computeUnitPrice <= 0n) return 0n;
  const micro = computeUnits * computeUnitPrice;
  return (micro + 1_000_000n - 1n) / 1_000_000n;
}

/**
 * After a Delegate, identify the stake account this run created by set-difference against the
 * pre-Delegate snapshot — never assume `delegations[0]` (wallet may already hold positions).
 */
async function resolveNewStakeAccount(beforeIds: ReadonlySet<string>): Promise<string> {
  const { delegations } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  const created = delegations.find((d) => !beforeIds.has(d.id));
  if (!created) {
    throw new Error(
      "Could not identify the stake account created by this Delegate (no new position vs pre-Delegate snapshot)."
    );
  }
  return created.id;
}

// ── DELEGATE ────────────────────────────────────────────────────────────────────────────────
// Creates a seed-derived stake account (lowest free seed), initializes it, and DelegateStake to a
// vote account. `amount` is the stake in lamports; the builder ADDS the rent-exempt reserve on top
// when funding. `isMaxAmount: true` is REJECTED — pass an explicit amount. `validator` is the VOTE
// ACCOUNT pubkey (what DelegateStake needs), not the node identity.
// Returns the derived stake-account id created by this Delegate (use it for Undelegate/Claim).
export async function stake(
  amountLamports: bigint,
  voteAccount: string
): Promise<{ txHash: string; stakeAccount: string }> {
  const { delegations: before } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  const beforeIds = new Set(before.map((d) => d.id));

  const tx: DelegateTransaction = {
    type: "Delegate",
    chain: solanaMainnet,
    amount: amountLamports,
    isMaxAmount: false,
    validator: voteAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  const stakeAccount = await resolveNewStakeAccount(beforeIds);
  logger.info(`Delegated! stakeAccount=${stakeAccount} https://explorer.solana.com/tx/${txHash}`);
  return { txHash, stakeAccount };
}

// Same Delegate, but overriding the priority fee for THIS transaction only (config default is
// otherwise used). Pass `computeUnitPrice: 0n` here to opt a single tx out of priority fees.
export async function stakeWithPriority(
  amountLamports: bigint,
  voteAccount: string,
  computeUnitPrice: bigint
): Promise<{ txHash: string; stakeAccount: string }> {
  const { delegations: before } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  const beforeIds = new Set(before.map((d) => d.id));

  const tx: DelegateTransaction = {
    type: "Delegate",
    chain: solanaMainnet,
    amount: amountLamports,
    isMaxAmount: false,
    validator: voteAccount,
    account: ADDRESS,
  };
  const base = (await sdk.estimateFee(tx)) as SolanaFee;
  // Re-price the fee for the new CU price. sign() reads fee.computeUnitPrice and emits the matching
  // SetComputeUnitPrice ix (that instruction is what's authoritative on-chain); we also recompute
  // `total` so the quote matches Solana’s ceil charge: total = baseFee + ceil(CU * price / 1e6).
  const priorityAtBase = priorityFeeLamportsCeil(base.computeUnits, base.computeUnitPrice);
  const baseFeeOnly = base.total - priorityAtBase;
  const priority = priorityFeeLamportsCeil(base.computeUnits, computeUnitPrice);
  const fee: SolanaFee = { ...base, computeUnitPrice, total: baseFeeOnly + priority };
  const nonce = await sdk.getNonce(solanaMainnet, ADDRESS);
  const signArgs: SigningWithPrivateKey = { transaction: tx, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signArgs);
  const txHash = await sdk.broadcast(solanaMainnet, rawTx);
  const stakeAccount = await resolveNewStakeAccount(beforeIds);
  logger.info(
    `Delegated (custom priority ${computeUnitPrice} µlamports/CU): stakeAccount=${stakeAccount} ${txHash}`
  );
  return { txHash, stakeAccount };
}

// ── UNDELEGATE ──────────────────────────────────────────────────────────────────────────────
// Deactivates the WHOLE stake account. Requires `stakeAccount` (the delegation.id from
// getDelegations). `amount` / `isMaxAmount` are IGNORED — there is no partial unstake and no Split
// in v1: you deactivate an entire account or nothing.
export async function undelegate(stakeAccount: string): Promise<string> {
  const tx: SolanaUndelegateTransaction = {
    type: "Undelegate",
    chain: solanaMainnet,
    amount: 0n, // ignored on-chain
    isMaxAmount: false,
    stakeAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  logger.info(`Deactivated! https://explorer.solana.com/tx/${txHash}`);
  return txHash;
}

// ── CLAIM DELEGATE ────────────────────────────────────────────────────────────────────────────
// Withdraws the FULL balance and CLOSES the stake account. Requires `stakeAccount`. Only succeeds
// once the stake is fully inactive (deactivated + cooled down across epoch boundaries). Rejected
// if the account never deactivated, or if a lockup is still in force (no custodian co-sign in v1).
export async function claimDelegate(stakeAccount: string): Promise<string> {
  const tx: SolanaClaimDelegateTransaction = {
    type: "ClaimDelegate",
    chain: solanaMainnet,
    amount: 0n, // ignored — always withdraws the whole account
    stakeAccount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  logger.info(`Withdrawn + closed! https://explorer.solana.com/tx/${txHash}`);
  return txHash;
}

// ── READS ─────────────────────────────────────────────────────────────────────────────────────
// Validators = vote accounts. `apy` is a computed issuance APY (percent); 0 means unavailable or
// delinquent. `operatorAddress` is the vote account you pass to Delegate.
export async function showValidators(): Promise<string> {
  const { data } = await sdk.getValidators(solanaMainnet, { page: 1, pageSize: 5 });
  logger.info("Validators (vote accounts)", {
    validators: data.map((v) => ({
      voteAccount: v.operatorAddress,
      status: v.status,
      apy: v.apy,
    })),
  });
  const chosen =
    VOTE_ACCOUNT ??
    data.find((v) => v.status === "Active")?.operatorAddress ??
    data[0]?.operatorAddress;
  if (!chosen) {
    throw new Error("No validators returned — check RPC URL");
  }
  return chosen;
}

// One entry per stake account. `id` IS the stake account address — the handle you pass back into
// Undelegate/ClaimDelegate as `stakeAccount`. Status: Active (active OR activating) / Pending
// (deactivating) / Claimable (inactive, ready to withdraw). `delegationIndex` = seed index, or -1
// for accounts discovered via the GPA fallback (not on our seed scheme).
export async function showDelegations(label: string): Promise<Delegation[]> {
  const { delegations } = await sdk.getDelegations(solanaMainnet, ADDRESS);
  // Stringify bigint fields — the logger JSON-stringifies context and bigints throw.
  logger.info(label, {
    delegations: delegations.map((d) => ({
      stakeAccount: d.id,
      status: d.status,
      amountLamports: d.amount.toString(),
      seed: d.delegationIndex.toString(),
      validator: d.validator.operatorAddress,
      pendingUntil: d.pendingUntil,
    })),
  });
  return delegations;
}

// Four balance buckets, all in lamports — NO "Rewards" (rewards auto-compound):
//   Available — liquid wallet balance
//   Staked    — Σ Active/activating positions
//   Pending   — Σ deactivating positions (still cooling down)
//   Claimable — Σ fully-inactive stake accounts' full withdrawable lamports (principal + rewards
//               + rent reserve) — this is the delegation you get back, not a separate reward.
export async function showBalances(): Promise<void> {
  const balances = await sdk.getBalances(solanaMainnet, ADDRESS);
  for (const b of balances) {
    logger.info(`${b.type}: ${Number(b.amount) / Number(LAMPORTS_PER_SOL)} SOL`);
  }
}

// ── SELECT & UNSTAKE (the common UI flow) ─────────────────────────────────────────────────────
// List positions, let the user pick one, unstake exactly that account. Unstaking is whole-account:
// you get back that position's amount (never a custom figure — that would need Split, not in v1).
export async function unstakeSelected(stakeAccountId: string): Promise<string> {
  const delegations = await showDelegations("Positions (pick one to unstake)");
  const chosen = delegations.find((d) => d.id === stakeAccountId);
  if (!chosen) {
    throw new Error(`No delegation with id ${stakeAccountId}`);
  }
  if (chosen.status !== "Active") {
    throw new Error(`Position ${chosen.id} is ${chosen.status}, not Active — cannot Undelegate.`);
  }
  logger.info(
    `Unstaking ${Number(chosen.amount) / Number(LAMPORTS_PER_SOL)} SOL from ${chosen.id}`
  );
  return undelegate(chosen.id); // stakeAccount = the row the user picked
}

// ── MPC / EXTERNAL SIGNING (prehash → sign externally → compile) ──────────────────────────────
// For hardware wallets / MPC. `preHash` returns base64 *message bytes* (the Ed25519 payload) — NOT
// the wire transaction. IMPORTANT: pass the `signArgs` RETURNED by preHash into compile (it carries
// the threaded state compile needs); do not reuse the object you passed in. `signature` is base64
// of the 64-byte Ed25519 signature.
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

  const { serializedTransaction, signArgs } = await sdk.preHash({
    transaction: delegate,
    fee,
    nonce,
  });
  logger.info("Message bytes (base64) — sign externally with Ed25519", { serializedTransaction });

  // …hand `serializedTransaction` to your external Ed25519 signer, get back the 64-byte signature…
  const externalSignatureBase64 = "<base64-64-byte-ed25519-signature>";

  // Pass the RETURNED signArgs (threaded state), not the original input.
  const rawTx = await sdk.compile({ signArgs, signature: externalSignatureBase64 });
  const txHash = await sdk.broadcast(solanaMainnet, rawTx);
  logger.info(`Submitted: https://explorer.solana.com/tx/${txHash}`);
}

// ── ORCHESTRATION ─────────────────────────────────────────────────────────────────────────────
// Full loop: pick a validator → Delegate → list positions → Undelegate.
// ClaimDelegate needs the stake to become fully inactive after deactivation (epoch wait).
export async function runFullLifecycle(): Promise<void> {
  if (!PRIVATE_KEY || ADDRESS.startsWith("<")) {
    logger.error(
      "Set SOLANA_PRIVATE_KEY and SOLANA_ADDRESS (and optionally SOLANA_RPC_URL / SOLANA_VOTE_ACCOUNT)."
    );
    process.exitCode = 1;
    return;
  }

  const voteAccount = await showValidators();
  await showBalances();

  // Stake 0.1 SOL (plus the rent-exempt reserve funded by the wallet on create).
  // Track the exact stake account this run created — never undelegate delegations[0].
  const { stakeAccount } = await stake(LAMPORTS_PER_SOL / 10n, voteAccount);
  await showDelegations("After Delegate (may show Active while still activating)");

  await undelegate(stakeAccount);
  await showDelegations("After Undelegate (Pending while deactivating)");

  // ── ClaimDelegate after epoch cooldown ────────────────────────────────────────────────────
  // Deactivation completes at an epoch boundary; wall time is one or more boundaries (~2–5 days).
  // Poll getDelegations until status === "Claimable", then:
  //
  //   await claimDelegate(stakeAccount);
  //
  // Rewards auto-compound into the stake account — there is no separate ClaimRewards op.
  logger.info(
    [
      "Waiting for inactive stake before ClaimDelegate is not automated in this sample.",
      `When status is Claimable, call claimDelegate("${stakeAccount}").`,
    ].join(" ")
  );
}

runFullLifecycle().catch((err) => {
  logger.error(`Lifecycle failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
