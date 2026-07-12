import { GuardianSDK, chains, tron, ConsoleLogger } from "@guardian-sdk/tron";
import type { TronDelegateTransaction, TronUndelegateTransaction } from "@guardian-sdk/tron";
import type {
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

// Full lifecycle: freeze → vote → partial unfreeze → claim principal + claim rewards.
// Each step is a separate on-chain transaction. Run against a real FullNode + funded
// testnet/mainnet account to see it end to end.
async function sample_full_lifecycle() {
  // ── 1. FREEZE — stake 100 TRX for BANDWIDTH. Gains resource + Tron Power. Earns NOTHING yet. ──
  const freeze: TronDelegateTransaction = {
    type: "Delegate",
    chain: tronMainnet,
    amount: 100_000_000n, // 100 TRX in SUN
    isMaxAmount: false,
    resource: "BANDWIDTH",
    account: ADDRESS,
  };

  const freezeFee = await sdk.estimateFee(freeze);
  const freezeNonce = await sdk.getNonce(tronMainnet, ADDRESS); // always 0 on Tron
  const freezeSignArgs: SigningWithPrivateKey = {
    transaction: freeze,
    fee: freezeFee,
    nonce: freezeNonce,
    privateKey: PRIVATE_KEY,
  };
  const freezeRawTx = await sdk.sign(freezeSignArgs);
  const freezeTxHash = await sdk.broadcast(tronMainnet, freezeRawTx);
  console.log(`Frozen! https://tronscan.org/#/transaction/${freezeTxHash}`);

  // getDelegations() now shows a Frozen placeholder position — staked but not yet voted.
  const afterFreeze = await sdk.getDelegations(tronMainnet, ADDRESS);
  console.log(
    "After freeze:",
    afterFreeze.delegations.map((d) => ({ status: d.status, amount: d.amount }))
  );
  // Expect: [{ status: "Frozen", amount: 100_000_000n }] — earning BANDWIDTH only, no TRX rewards.

  // ── 2. VOTE — allocate 100 votes (100 TRX of Tron Power) to a Super Representative. ──
  // NOW earning TRX voting rewards.
  const vote: VoteTransaction = {
    type: "Vote",
    chain: tronMainnet,
    validator: SR_ADDRESS,
    amount: 100_000_000n,
    account: ADDRESS,
  };

  const voteFee = await sdk.estimateFee(vote);
  const voteNonce = await sdk.getNonce(tronMainnet, ADDRESS);
  const voteSignArgs: SigningWithPrivateKey = {
    transaction: vote,
    fee: voteFee,
    nonce: voteNonce,
    privateKey: PRIVATE_KEY,
  };
  const voteRawTx = await sdk.sign(voteSignArgs);
  const voteTxHash = await sdk.broadcast(tronMainnet, voteRawTx);
  console.log(`Voted! https://tronscan.org/#/transaction/${voteTxHash}`);

  // getDelegations() now shows an Active position with the real SR — earning TRX rewards.
  const afterVote = await sdk.getDelegations(tronMainnet, ADDRESS);
  console.log(
    "After vote:",
    afterVote.delegations.map((d) => ({
      status: d.status,
      amount: d.amount,
      validator: d.validator.id,
    }))
  );
  // Expect: [{ status: "Active", amount: 100_000_000n, validator: SR_ADDRESS }]

  // ── 3. UNFREEZE — partial unstake of 40 TRX. Starts its own 14-day unbonding clock. ──
  const unfreeze: TronUndelegateTransaction = {
    type: "Undelegate",
    chain: tronMainnet,
    amount: 40_000_000n, // 40 TRX in SUN — partial; the remaining 60 TRX stays Active
    isMaxAmount: false,
    resource: "BANDWIDTH",
    account: ADDRESS,
  };

  const unfreezeFee = await sdk.estimateFee(unfreeze);
  const unfreezeNonce = await sdk.getNonce(tronMainnet, ADDRESS);
  const unfreezeSignArgs: SigningWithPrivateKey = {
    transaction: unfreeze,
    fee: unfreezeFee,
    nonce: unfreezeNonce,
    privateKey: PRIVATE_KEY,
  };
  const unfreezeRawTx = await sdk.sign(unfreezeSignArgs);
  const unfreezeTxHash = await sdk.broadcast(tronMainnet, unfreezeRawTx);
  console.log(`Unfrozen (partial)! https://tronscan.org/#/transaction/${unfreezeTxHash}`);

  // getDelegations() now shows Active 60 TRX (still voted) + Pending 40 TRX (pendingUntil = now + 14d).
  const afterUnfreeze = await sdk.getDelegations(tronMainnet, ADDRESS);
  console.log(
    "After unfreeze:",
    afterUnfreeze.delegations.map((d) => ({
      status: d.status,
      amount: d.amount,
      pendingUntil: d.pendingUntil,
    }))
  );

  // ── 4a. CLAIM PRINCIPAL — after 14 days, withdraw the matured unfrozen TRX. ──
  // Independent transaction — WithdrawExpireUnfreeze. Only succeeds once `pendingUntil` has passed.
  const claimPrincipal: ClaimDelegateTransaction = {
    type: "ClaimDelegate",
    chain: tronMainnet,
    amount: 0n, // Tron ignores this; the on-chain unfreeze queue determines the withdrawn amount
    account: ADDRESS,
    validator: SR_ADDRESS,
    index: 0n,
  };

  const claimPrincipalFee = await sdk.estimateFee(claimPrincipal);
  const claimPrincipalNonce = await sdk.getNonce(tronMainnet, ADDRESS);
  const claimPrincipalSignArgs: SigningWithPrivateKey = {
    transaction: claimPrincipal,
    fee: claimPrincipalFee,
    nonce: claimPrincipalNonce,
    privateKey: PRIVATE_KEY,
  };
  const claimPrincipalRawTx = await sdk.sign(claimPrincipalSignArgs);
  const claimPrincipalTxHash = await sdk.broadcast(tronMainnet, claimPrincipalRawTx);
  console.log(`Claimed principal! https://tronscan.org/#/transaction/${claimPrincipalTxHash}`);

  // ── 4b. CLAIM REWARDS — independent of the principal claim above. ──
  // Anytime rewards have accrued (24h cooldown, ~1 TRX minimum) — WithdrawBalance.
  const balances = await sdk.getBalances(tronMainnet, ADDRESS);
  const rewards = balances.find((b) => b.type === "Rewards");

  if (!rewards || rewards.amount === 0n) {
    console.log("No rewards to claim yet.");
    return;
  }

  const claimRewards: ClaimRewardsTransaction = {
    type: "ClaimRewards",
    chain: tronMainnet,
    amount: rewards.amount,
    account: ADDRESS,
    validator: SR_ADDRESS,
  };

  const claimRewardsFee = await sdk.estimateFee(claimRewards);
  const claimRewardsNonce = await sdk.getNonce(tronMainnet, ADDRESS);
  const claimRewardsSignArgs: SigningWithPrivateKey = {
    transaction: claimRewards,
    fee: claimRewardsFee,
    nonce: claimRewardsNonce,
    privateKey: PRIVATE_KEY,
  };
  const claimRewardsRawTx = await sdk.sign(claimRewardsSignArgs);
  const claimRewardsTxHash = await sdk.broadcast(tronMainnet, claimRewardsRawTx);
  console.log(`Claimed rewards! https://tronscan.org/#/transaction/${claimRewardsTxHash}`);
}

// For hardware wallets, MPC setups, or HSMs where you can't expose raw private keys:
// preHash() builds the unsigned tx (serializedTransaction === the txID, SHA256(raw_data)),
// compile() reassembles the final tx from an external secp256k1 signature.
async function sample_mpc_vote() {
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

sample_full_lifecycle();
