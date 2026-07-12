import { GuardianSDK, chains, tron, ConsoleLogger } from "@guardian-sdk/tron";
import type { TronDelegateTransaction, TronUndelegateTransaction } from "@guardian-sdk/tron";
import type {
  Transaction,
  VoteTransaction,
  ClaimDelegateTransaction,
  ClaimRewardsTransaction,
  SigningWithPrivateKey,
} from "@guardian-sdk/sdk";

const { tronMainnet } = chains;

// FullNode HTTP endpoint — no TronGrid. Point at your own node or a FullNode-compatible provider.
const sdk = new GuardianSDK([
  tron({
    rpcUrl: process.env.TRON_FULLNODE_URL ?? "https://<your-tron-fullnode>",
    logger: new ConsoleLogger("debug"),
  }),
]);

// Raw secp256k1 private key (hex). Set via environment variable — NEVER hardcode or commit.
const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY ?? "";
const ADDRESS = process.env.TRON_ADDRESS ?? "TYourTronBase58Address...";
const SR_ADDRESS = process.env.TRON_SR_ADDRESS ?? "T<SR-address>";

/**
 * Estimate the fee, fetch the nonce (always 0 on Tron), sign with the raw key, and broadcast.
 * Every write action below funnels through here, so the per-action functions stay focused on
 * just building their transaction.
 */
async function submit(transaction: Transaction): Promise<string> {
  const fee = await sdk.estimateFee(transaction);
  const nonce = await sdk.getNonce(tronMainnet, ADDRESS); // Tron uses ref-block + expiration, so this is 0
  const signArgs: SigningWithPrivateKey = { transaction, fee, nonce, privateKey: PRIVATE_KEY };
  const rawTx = await sdk.sign(signArgs);
  return sdk.broadcast(tronMainnet, rawTx);
}

// ── FREEZE ──────────────────────────────────────────────────────────────────────────────────
// Stake TRX for a resource. Gains the resource + 1:1 Tron Power, but earns NOTHING until you vote.
export async function freeze(amount: bigint, resource: "BANDWIDTH" | "ENERGY"): Promise<string> {
  const tx: TronDelegateTransaction = {
    type: "Delegate",
    chain: tronMainnet,
    amount,
    isMaxAmount: false,
    resource,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Frozen! https://tronscan.org/#/transaction/${txHash}`);
  return txHash;
}

// ── VOTE ────────────────────────────────────────────────────────────────────────────────────
// Allocate Tron Power to a Super Representative. This is what actually starts earning TRX rewards.
export async function vote(srAddress: string, amount: bigint): Promise<string> {
  const tx: VoteTransaction = {
    type: "Vote",
    chain: tronMainnet,
    validator: srAddress,
    amount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Voted! https://tronscan.org/#/transaction/${txHash}`);
  return txHash;
}

// ── UNSTAKE ─────────────────────────────────────────────────────────────────────────────────
// Begin unfreezing (partial allowed). Starts an independent ~14-day unbonding clock for this amount.
export async function unstake(amount: bigint, resource: "BANDWIDTH" | "ENERGY"): Promise<string> {
  const tx: TronUndelegateTransaction = {
    type: "Undelegate",
    chain: tronMainnet,
    amount,
    isMaxAmount: false,
    resource,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Unfrozen (partial)! https://tronscan.org/#/transaction/${txHash}`);
  return txHash;
}

// ── WITHDRAW: matured principal ───────────────────────────────────────────────────────────────
// WithdrawExpireUnfreeze — sweeps unfrozen TRX whose 14-day bond has matured back to the wallet.
// validator/index are optional on ClaimDelegateTransaction and IGNORED by Tron — omit them.
export async function withdrawPrincipal(): Promise<string> {
  const tx: ClaimDelegateTransaction = {
    type: "ClaimDelegate",
    chain: tronMainnet,
    amount: 0n, // ignored by Tron; the on-chain unfreeze queue determines the withdrawn amount
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Claimed principal! https://tronscan.org/#/transaction/${txHash}`);
  return txHash;
}

// ── WITHDRAW: voting rewards ──────────────────────────────────────────────────────────────────
// WithdrawBalance — independent of the principal claim; 24h cooldown, ~1 TRX on-chain minimum.
// No-op (returns undefined) when there is nothing to claim.
export async function withdrawRewards(): Promise<string | undefined> {
  const balances = await sdk.getBalances(tronMainnet, ADDRESS);
  const rewards = balances.find((b) => b.type === "Rewards");
  if (!rewards || rewards.amount === 0n) {
    console.log("No rewards to claim yet.");
    return undefined;
  }
  // validator is optional on ClaimRewardsTransaction and IGNORED by Tron — omit it.
  const tx: ClaimRewardsTransaction = {
    type: "ClaimRewards",
    chain: tronMainnet,
    amount: rewards.amount,
    account: ADDRESS,
  };
  const txHash = await submit(tx);
  console.log(`Claimed rewards! https://tronscan.org/#/transaction/${txHash}`);
  return txHash;
}

// ── READS: validators & delegations ───────────────────────────────────────────────────────────
export async function showValidators(): Promise<void> {
  const { data } = await sdk.getValidators(tronMainnet, { page: 1, pageSize: 5 });
  console.log(
    "Top validators:",
    data.map((v) => ({ id: v.id, name: v.name, apy: v.apy, status: v.status }))
  );
}

export async function showDelegations(label: string): Promise<void> {
  const { delegations } = await sdk.getDelegations(tronMainnet, ADDRESS);
  console.log(
    `${label}:`,
    delegations.map((d) => ({
      status: d.status,
      amount: d.amount,
      validator: d.validator.id,
      pendingUntil: d.pendingUntil,
    }))
  );
}

// ── ORCHESTRATION ─────────────────────────────────────────────────────────────────────────────
// Full lifecycle: freeze → vote → partial unstake → claim principal + claim rewards.
// Run against a real FullNode + funded testnet/mainnet account to see it end to end.
export async function runFullLifecycle(): Promise<void> {
  await showValidators();

  await freeze(100_000_000n, "BANDWIDTH"); // stake 100 TRX for BANDWIDTH
  await showDelegations("After freeze"); // → [{ status: "Frozen", amount: 100_000_000n }]

  await vote(SR_ADDRESS, 100_000_000n); // vote all 100 TRX of Tron Power
  await showDelegations("After vote"); // → [{ status: "Active", amount: 100_000_000n }]

  await unstake(40_000_000n, "BANDWIDTH"); // partial unstake of 40 TRX; 60 TRX stays Active
  await showDelegations("After unfreeze"); // → Active 60 TRX + Pending 40 TRX

  // The two withdrawals below are independent and only succeed once their balances are ready:
  // `withdrawPrincipal` after the 14-day bond matures; `withdrawRewards` once rewards have accrued.
  await withdrawPrincipal();
  await withdrawRewards();
}

// For hardware wallets, MPC setups, or HSMs where you can't expose raw private keys:
// preHash() builds the unsigned tx (serializedTransaction === the txID, SHA256(raw_data)),
// compile() reassembles the final tx from an external secp256k1 signature.
export async function sampleMpcVote(): Promise<void> {
  const vote: VoteTransaction = {
    type: "Vote",
    chain: tronMainnet,
    validator: SR_ADDRESS,
    amount: 100_000_000n,
    account: ADDRESS,
  };

  const fee = await sdk.estimateFee(vote);
  const nonce = await sdk.getNonce(tronMainnet, ADDRESS);
  const signArgs = { transaction: vote, fee, nonce };

  const { serializedTransaction } = await sdk.preHash(signArgs);
  console.log("txID (sign this externally with secp256k1):", serializedTransaction);

  // Sign serializedTransaction externally, then compile:
  const externalSignatureHex = "<external secp256k1 signature over the txID>";

  const rawTx = await sdk.compile({ signArgs, signature: externalSignatureHex });
  const txHash = await sdk.broadcast(tronMainnet, rawTx);
  console.log(`Submitted: https://tronscan.org/#/transaction/${txHash}`);
}

runFullLifecycle();
