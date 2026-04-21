# @guardian-sdk/cardano — Cardano

Native staking support for Cardano, part of the [Guardian SDK](../../README.md).

Abstracts Blockfrost API calls and CBOR transaction construction behind a clean, type-safe API so you can build staking features without dealing with bech32 decoding, stake certificate encoding, UTXO coin selection, or Cardano-specifics.

## Table of Contents

- [How Cardano Native Staking Works](#how-cardano-native-staking-works)
  - [Stake Pools](#stake-pools)
  - [Stake Keys and Addresses](#stake-keys-and-addresses)
  - [UTXO Model — Delegation Without Locking](#utxo-model--delegation-without-locking)
  - [Rewards](#rewards)
  - [Lifecycle of a Stake](#lifecycle-of-a-stake)
  - [Epochs and Reward Timing](#epochs-and-reward-timing)
  - [Fee Model](#fee-model)
  - [Key Protocol Parameters](#key-protocol-parameters)
- [Blockfrost Setup](#blockfrost-setup)
- [Installation](#installation)
  - [Dependencies](#dependencies)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [cardano()](#cardano)
  - [getValidators](#getvalidators)
  - [getDelegations](#getdelegations)
  - [getBalances](#getbalances)
  - [getNonce](#getnonce)
  - [estimateFee](#estimatefee)
  - [sign](#sign)
  - [preHash and compile](#prehash-and-compile)
- [Transaction Flows](#transaction-flows)
  - [Delegate — register and start staking](#delegate--register-and-start-staking)
  - [Redelegate — switch pool](#redelegate--switch-pool)
  - [Undelegate — stop staking and recover deposit](#undelegate--stop-staking-and-recover-deposit)
  - [ClaimRewards — withdraw accumulated rewards](#claimrewards--withdraw-accumulated-rewards)
- [Signing Flows](#signing-flows)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)
- [Roadmap](#roadmap)

---

## How Cardano Native Staking Works

Cardano uses **Ouroboros** — a proof-of-stake consensus protocol where block production rights are proportional to the amount of ADA delegated to a stake pool. ADA holders delegate their **stake** to pools to participate in network security and earn rewards without locking or transferring any tokens.

### Stake Pools

A stake pool is an always-on server that participates in block production on behalf of its delegators. Pools are identified by a bech32 pool ID (e.g. `pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy`).

Each pool sets two fee parameters that reduce delegator rewards:

- **Fixed cost** — a flat ADA amount taken from rewards each epoch (currently minimum 170 ADA on mainnet). Pools must cover their operating costs before distributing to delegators.
- **Margin** — a percentage of the remaining rewards the pool operator keeps (0–100%). The rest goes to delegators.

The return on stake (ROS) a delegator earns is approximately:

```
delegator ROS ≈ protocol_yield × (1 − margin) − fixed_cost / pool_active_stake
```

The protocol targets roughly **4–5% annual yield** across all stake. Actual returns depend on pool performance (blocks produced vs expected) and pool saturation.

**Saturation**: Each pool has a target size determined by the `k` parameter (currently 500 optimal pools, each ideally holding 1/500 of total ADA staked). Pools above saturation earn reduced rewards — this design incentivises delegators to spread ADA across many pools rather than concentrating in a few.

As of 2026, the network has approximately **3,000 pools**, of which ~2,400 are active.

### Stake Keys and Addresses

Every Cardano wallet has **two independent key pairs** derived from the same root seed:

```
root seed (mnemonic)
├── payment key  (m/1852'/1815'/0'/0/0)  ──► addr1...  (payment addresses)
└── staking key  (m/1852'/1815'/0'/2/0)  ──► stake1... (stake address)
```

| Key | Authorises | Derived address |
|---|---|---|
| **Payment key** | Spending UTXOs; paying fees | `addr1...` payment addresses |
| **Staking key** | Delegation certificates; reward withdrawals | `stake1...` stake address |

The **stake address** (`stake1...`) is a single identifier for your staking account regardless of how many payment addresses you use. It is the handle for all staking operations: registering the key, delegating to a pool, and withdrawing rewards.

Both keys are required to sign any staking transaction. The SDK accepts them as separate `paymentPrivateKey` and `stakingPrivateKey` fields in `sign()`.

> **Key format**: The SDK accepts standard Ed25519 private keys — 32 bytes as 64 hex characters. BIP32-Ed25519 HD wallet keys are 64-byte extended keys; pass only the first 32 bytes (the private scalar). Hex values may optionally be prefixed with `0x`.

### UTXO Model — Delegation Without Locking

Cardano uses an **Unspent Transaction Output (UTXO)** model. Every ADA sits in a specific UTXO, not in an account balance. When you delegate, you are not moving or locking any of your UTXOs — you are registering a preference on-chain that says "assign the stake weight of all UTXOs controlled by my staking key to pool X".

This has two important consequences:

1. **Nothing is locked.** Your ADA is fully spendable at all times, even while actively delegating. Receiving, sending, or spending ADA does not interrupt delegation — the pool earns rewards on whatever ADA you hold at each epoch snapshot.

2. **No unbonding period.** Changing or stopping delegation takes effect in the next epoch with no waiting period. You pay only the regular transaction fee.

`getDelegations()` reports `amount` as your total controlled ADA — the economic weight your delegation carries — rather than a locked amount. All four balance types return the same base amount: `Available` and `Staked` are always equal because nothing is locked.

### Rewards

Rewards do **not** auto-compound into your staked balance. They accumulate separately in your reward account and must be explicitly withdrawn using a `ClaimRewards` transaction.

Rewards become spendable two epochs after they are earned (see [Epochs and Reward Timing](#epochs-and-reward-timing)). The `Claimable` balance in `getBalances()` is the amount available to withdraw right now.

When you withdraw rewards, the ADA moves from the reward account to a payment address you control. You can withdraw and redelegate simultaneously in the same transaction, or withdraw separately.

### Lifecycle of a Stake

```
                                          redelegate()
                                  ┌─────────────────────────────────┐
                                  │                                  ▼
  register + delegate() ──► [ Delegating ]               [ Delegating — new pool ]
                                  │
                             undelegate()
                                  │
                                  ▼
                            [ Deregistered ] ──► 2 ADA deposit returned to wallet
```

```
  [ Delegating ] ──► rewards accumulate each epoch ──► [ Claimable rewards ]
                                                               │
                                                           claim()
                                                               │
                                                               ▼
                                                       ADA in payment address
```

| Stage | Description |
|---|---|
| **Unregistered** | Stake key does not exist on-chain. A 2 ADA deposit is required to register it. |
| **Registered, not delegating** | Stake key registered but no pool selected. Key deposit is locked on-chain. No rewards earned. |
| **Delegating** | ADA earns rewards every epoch. Delegation is active as of epoch N+2 after the delegation transaction. |
| **Claimable rewards** | Rewards distributed at the end of each epoch, available to withdraw from epoch N+2 onward. |
| **Deregistered** | Stake key removed from chain. The 2 ADA deposit is refunded in the same transaction. Any unclaimed rewards are lost — always claim before deregistering. |

### Delegation cycle in detail

**First-time delegation** (most common path):

```
  1. Submit delegation tx with:
     ├── StakeRegistration certificate  → 2 ADA deposit deducted from wallet
     └── StakeDelegation certificate   → pool assignment recorded on-chain

  2. End of current epoch N:
     └── On-chain snapshot taken. Your ADA counted toward the pool.

  3. Epoch N+1:
     └── Pool produces blocks weighted by total delegated stake.
         Your stake is included.

  4. Epoch N+2:
     └── Rewards for epoch N+1 are calculated and distributed.
         Your Claimable balance increases.

  5. Repeat from step 2 every epoch (~5 days).
```

**Redelegation** (switching pool):

```
  1. Submit redelegate tx with:
     └── StakeDelegation certificate to new pool (no deposit needed, no fee beyond tx fee)

  2. Change takes effect at end of current epoch.
     Old pool: earns rewards until snapshot.
     New pool: earns rewards from next epoch.

  3. No rewards are lost. No unbonding period.
```

**Undelegation** (stop staking):

```
  1. Claim any unclaimed rewards first — they are lost on deregistration.

  2. Submit undelegate tx with:
     └── StakeDeregistration certificate → 2 ADA deposit refunded in same tx

  3. Pool stops earning on your behalf from next epoch.
     Your ADA remains fully spendable throughout.

  4. If you want to delegate again later, pay the 2 ADA deposit again.
```

**Claiming rewards**:

```
  1. Check Claimable balance: getBalances() → Claimable amount

  2. Submit claim tx with:
     └── Withdrawal entry: reward account → lovelace amount
         ADA moves from reward account to your payment address.

  3. Delegation continues uninterrupted. Claiming does not affect your pool assignment.
```

### Epochs and Reward Timing

A Cardano **epoch** spans 5 days (432,000 slots at 1 second per slot). Epochs are numbered sequentially and the exact reward schedule is deterministic:

```
  Epoch N       Epoch N+1      Epoch N+2
  ─────────────────────────────────────────────────────────────────
  │              │              │
  ▼              ▼              ▼
  Tx confirmed   Stake counted  Rewards distributed → Claimable
  (delegation    in leader      (visible in
   included)     schedule       withdrawable_amount)
```

| Event | Timing |
|---|---|
| Delegation submitted | Epoch N (any slot) |
| Pool counts your stake | Epoch N+1 |
| First rewards calculated | End of Epoch N+1 |
| First rewards spendable | Epoch N+2 (5–10 days after delegation) |
| Subsequent rewards | Every epoch (~5 days) |

The first reward after first-time delegation therefore arrives **10–15 days** after the transaction is confirmed, depending on where in the epoch you delegated. After that, rewards are added to your Claimable balance at the start of each new epoch.

### Fee Model

Cardano fees are calculated from the **size of the transaction**, not from gas:

```
fee = minFeeA × txSizeInBytes + minFeeB
```

Current mainnet parameters (protocol version 9):

| Parameter | Value | Description |
|---|---|---|
| `minFeeA` | 44 lovelaces/byte | Per-byte coefficient |
| `minFeeB` | 155,381 lovelaces | Base fee |
| Typical tx size | 300–400 bytes | Staking transactions |
| **Typical fee** | **~0.17–0.18 ADA** | For a delegation tx |

Because the fee depends on the transaction size and the transaction size depends on the fee (it's a field in the body), the SDK estimates the size using mock 32/64-byte witnesses (same byte length as real signatures) and applies the formula once. No iteration is needed.

**There is no fee priority mechanism.** All valid transactions with the correct minimum fee are treated equally by block producers. Transactions cannot be accelerated by offering a higher fee.

**Gas estimation is not used.** Every operation has a predictable, deterministic fee based on its serialised size.

Typical fees observed on mainnet:

| Operation | Approx. fee | Notes |
|---|---|---|
| Delegate (first time) | ~0.18 ADA + 2 ADA deposit | Registration + delegation certificates |
| Redelegate | ~0.17 ADA | Delegation certificate only |
| Undelegate | ~0.17 ADA − 2 ADA deposit returned | Net cost is negative (deposit refunded) |
| Claim rewards | ~0.17 ADA | Withdrawal only |

### Key Protocol Parameters

| Parameter | Value |
|---|---|
| Stake key registration deposit | 2 ADA (refunded on deregistration) |
| Unbonding period | None |
| Redelegate fee | None (standard tx fee only) |
| Min delegation amount | No protocol minimum (deposit is the effective minimum) |
| Epoch duration | 5 days |
| Target number of pools (k) | 500 |
| Approximate protocol yield | ~4–5% annually |
| Active pools (approx.) | ~2,400 |
| Total registered pools | ~3,000 |
| Mainnet staking explorer | https://cardanoscan.io |
| Preprod staking explorer | https://preprod.cardanoscan.io |

---

## Blockfrost Setup

All on-chain queries go through [Blockfrost](https://blockfrost.io) — the most widely used Cardano API service. No local node is required.

1. Register at [blockfrost.io](https://blockfrost.io)
2. Create a **Cardano mainnet** project
3. Copy the `project_id` key (format: `mainnet...`)

```typescript
cardano({ apiKey: "mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" })
```

**Rate limits**:

| Tier | Requests/day |
|---|---|
| Free | 50,000 |
| Starter | 500,000 |
| Professional | 5,000,000 |

The SDK caches validator lists for 10 minutes to reduce API calls. Stake account queries and UTXOs are always fetched fresh.

---

## Installation

```bash
npm install @guardian-sdk/cardano @guardian-sdk/sdk @cardano-sdk/core @cardano-sdk/crypto @cardano-sdk/util
```

### Dependencies

| Package | Role |
|---|---|
| [`@guardian-sdk/sdk`](https://www.npmjs.com/package/@guardian-sdk/sdk) | Peer dependency — chain-agnostic core, shared types and interfaces |
| [`@cardano-sdk/core`](https://www.npmjs.com/package/@cardano-sdk/core) | Peer dependency — Cardano primitives: addresses, transactions, certificates |
| [`@cardano-sdk/crypto`](https://www.npmjs.com/package/@cardano-sdk/crypto) | Peer dependency — Ed25519 key operations and Blake2b hashing |
| [`@cardano-sdk/util`](https://www.npmjs.com/package/@cardano-sdk/util) | Peer dependency — shared utilities for the Cardano SDK family |

If your project already uses any of these, the same instances will be shared — no duplicate copies. The signing and hashing libraries (`@noble/ed25519`, `@noble/hashes`, `@scure/base`) are bundled as regular dependencies and do not need to be installed separately.

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import { cardano, chains } from "@guardian-sdk/cardano";

const sdk = new GuardianSDK([
  cardano({ apiKey: "mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
]);

const PAYMENT_ADDRESS = "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae";
const STAKE_ADDRESS   = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";
const PAYMENT_KEY     = "your64hexcharpaymentprivatekeyhere00000000000000000000000000000000";
const STAKING_KEY     = "your64hexcharstakingprivatekeyhere00000000000000000000000000000000";

// 1. Browse stake pools
const pools = await sdk.getValidators(chains.cardanoMainnet);
console.log(`${pools.length} pools found, top pool: ${pools[0].name}`);

// 2. Check current delegation
const { delegations, stakingSummary } = await sdk.getDelegations(chains.cardanoMainnet, STAKE_ADDRESS);
console.log(`Max APY: ${stakingSummary.maxApy.toFixed(2)}%`);

// 3. Check balances
const balances = await sdk.getBalances(chains.cardanoMainnet, STAKE_ADDRESS);
for (const b of balances) {
  console.log(b.type, Number(b.amount) / 1e6, "ADA");
}
// Available  9.95 ADA
// Staked     9.95 ADA   ← same — nothing is locked
// Pending    0 ADA      ← always 0
// Claimable  2.1 ADA    ← accumulated rewards

// 4. Delegate to the top pool
import type { CardanoSigningWithPrivateKey } from "@guardian-sdk/cardano";

const transaction = {
  type: "Delegate" as const,
  chain: chains.cardanoMainnet,
  amount: 0n,
  account: PAYMENT_ADDRESS,
  isMaxAmount: false,
  validator: pools[0],
};

const fee = await sdk.estimateFee(transaction);
console.log(`Fee: ${Number(fee.total) / 1e6} ADA`);

const signingArgs: CardanoSigningWithPrivateKey = {
  transaction,
  fee,
  nonce: 0,
  paymentPrivateKey: PAYMENT_KEY,
  stakingPrivateKey: STAKING_KEY,
};
const rawTx = await sdk.sign(signingArgs);
const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
console.log(`Delegated! https://cardanoscan.io/transaction/${txHash}`);
```

---

## API Reference

### `cardano()`

Factory function. Returns a `GuardianServiceContract` for the Cardano mainnet.

```typescript
function cardano(config: CardanoConfig): GuardianServiceContract

interface CardanoConfig {
  apiKey: string;   // Blockfrost project_id for mainnet
  logger?: Logger;  // optional; defaults to NoopLogger
}
```

---

### `getValidators`

Returns stake pools registered on Cardano. Fetches the first 20 pools sorted by live stake descending — the largest, most active pools first. Pool metadata (name, ticker, description) is batch-fetched in parallel and results are cached for 10 minutes.

> **Pagination not yet supported.** The SDK currently returns only the top 20 pools by live stake. Full pagination across all ~3,000 registered pools will be added in an upcoming release. If you are delegating to a pool outside this set, `getDelegations()` fetches it directly by pool ID — your delegation is always indexed regardless of whether your pool appears in `getValidators()`.

```typescript
// All pools
const pools = await sdk.getValidators(chains.cardanoMainnet);

// Only active pools (excluding those in retirement)
const active = await sdk.getValidators(chains.cardanoMainnet, "Active");

// Active and inactive
const subset = await sdk.getValidators(chains.cardanoMainnet, ["Active", "Inactive"]);
```

**Returns:** `Promise<Validator[]>`

```typescript
interface Validator {
  id: string;                 // bech32 pool ID — pool1...
  status: ValidatorStatus;   // "Active" | "Inactive"
  name: string;              // Pool name from metadata, or ticker, or truncated pool ID
  description: string;       // Pool description from metadata
  image: undefined;          // Cardano pools have no standard logo URL format
  apy: number;               // Estimated annual yield (%)
  delegators: number | undefined; // Live delegator count (undefined when fetched via getDelegations)
  operatorAddress: string;   // bech32 pool ID — use in transaction.validator
  creditAddress: string;     // Same as operatorAddress (no separate credit contract)
}

type ValidatorStatus = "Active" | "Inactive";
// Active   — pool is registered and not in retirement
// Inactive — pool has submitted a retirement certificate (retiring next epoch)
```

> **APY estimation**: Blockfrost does not expose a pre-calculated ROA field. The SDK estimates it as `4.5% × (1 − margin) × saturationFactor × (1 − fixedCostFraction)`, where 4.5% is the approximate protocol-level yield. Actual earned rewards depend on pool luck and real-time performance. For precise historical ROA, call Blockfrost's `/pools/{id}/history` directly.

> **Caching**: Validator data is cached in memory for 10 minutes per `GuardianSDK` instance. Elections and pool changes happen at epoch boundaries (~5 days), so short-lived caches are appropriate.

---

### `getDelegations`

Returns the current delegation state and a summary of the staking protocol. Accepts either a stake address (`stake1...`) or a base payment address (`addr1q...`) — the stake credential is extracted automatically from a payment address.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(
  chains.cardanoMainnet,
  "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa"
);
```

**Returns:** `Promise<Delegations>`

```typescript
interface Delegations {
  delegations: Delegation[];    // At most one entry on Cardano
  stakingSummary: StakingSummary;
}

interface Delegation {
  id: string;
  validator: Validator;         // Full pool details
  amount: bigint;               // Total ADA controlled by the stake key, in lovelaces
  status: "Active";             // Cardano: always "Active" when delegating
  delegationIndex: 0n;          // Not used in Cardano
  pendingUntil: 0;              // No unbonding period
}

interface StakingSummary {
  totalProtocolStake: number;   // Total ADA staked network-wide (in ADA, not lovelaces)
  maxApy: number;               // Highest estimated APY across the top 20 pools by live stake
  minAmountToStake: 2_000_000n; // 2 ADA stake key registration deposit (in lovelaces)
  unboundPeriodInMillis: 0;     // No unbonding period
  redelegateFeeRate: 0;         // No fee to switch pools
  activeValidators: undefined;  // Not available from getDelegations — use getValidators()
  totalValidators: undefined;   // Not available from getDelegations — use getValidators()
}
```

> Cardano on-chain supports **only one active delegation per stake key**. Multi-pool delegation (CIP-17) is a metadata-layer convention implemented by wallets across multiple stake keys — there is no native multi-pool delegation. `delegations` therefore contains at most one entry.

> If the stake key is not registered or not currently delegating, `delegations` is an empty array.

---

### `getBalances`

Returns the four balance categories for an address. Accepts either a stake address (`stake1...`) or a base payment address (`addr1q...`) — the stake credential is extracted automatically from a payment address. Balances reflect the total ADA controlled by the stake key across all associated payment addresses.

```typescript
const balances = await sdk.getBalances(
  chains.cardanoMainnet,
  "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa"
);
```

**Returns:** `Promise<Balance[]>`

All amounts are in lovelaces (1 ADA = 1,000,000 lovelaces).

| Type | What it represents on Cardano |
|---|---|
| **Available** | `controlled_amount` from Blockfrost — all ADA controlled by the stake key, fully spendable at all times |
| **Staked** | Same as `Available` — delegation on Cardano does not lock or move any funds. The pool earns rewards on whatever ADA you hold at each epoch snapshot. |
| **Rewards** | `withdrawable_amount` from Blockfrost — rewards that have been distributed and are sitting in the reward account, ready to withdraw via a `ClaimRewards` transaction |

```typescript
type BalanceType = "Available" | "Staked" | "Pending" | "Rewards";
```

```typescript
const balances = await sdk.getBalances(chains.cardanoMainnet, STAKE_ADDRESS);
for (const b of balances) {
  console.log(b.type, (Number(b.amount) / 1e6).toFixed(6), "ADA");
}
// Available  9.950000 ADA
// Staked     9.950000 ADA
// Pending    0.000000 ADA
// Claimable  2.100000 ADA
```

> `Claimable` reflects rewards that have already been distributed and are available to withdraw. Rewards currently being earned in the active epoch are not yet included.

---

### `getNonce`

Cardano uses a UTXO model — transactions reference specific UTXOs as inputs, not account nonces. This always returns `0`. The double-spend protection is handled internally by UTXO input selection during signing.

```typescript
const nonce = await sdk.getNonce(chains.cardanoMainnet, address); // always 0
```

---

### `estimateFee`

Estimates the transaction fee by fetching protocol parameters and UTXOs from Blockfrost, building a draft transaction with mock witnesses, and applying the fee formula.

**`transaction.account` must be set** to the payment address (`addr1...`) so the SDK can fetch UTXOs for coin selection.

```typescript
const fee = await sdk.estimateFee(transaction);
```

**Returns:** `Promise<UtxoFee>`

```typescript
interface UtxoFee {
  type: "UtxoFee";
  txSizeBytes: number;   // Estimated serialised transaction size in bytes
  total: bigint;         // Total fee in lovelaces
}
```

Accepts all four transaction types:

```typescript
// Delegate — register stake key and set pool
const fee = await sdk.estimateFee({
  type: "Delegate",
  chain: chains.cardanoMainnet,
  amount: 0n,                  // amount is unused for delegation
  account: PAYMENT_ADDRESS,   // required for UTXO fetch
  isMaxAmount: false,
  validator: pools[0],
});

// Redelegate — change pool
const fee = await sdk.estimateFee({
  type: "Redelegate",
  chain: chains.cardanoMainnet,
  amount: 0n,
  account: PAYMENT_ADDRESS,
  isMaxAmount: false,
  fromValidator: currentDelegation.validator,
  toValidator: newPool,
});

// Undelegate — deregister stake key
const fee = await sdk.estimateFee({
  type: "Undelegate",
  chain: chains.cardanoMainnet,
  amount: 0n,
  account: PAYMENT_ADDRESS,
  isMaxAmount: false,
  validator: currentDelegation.validator,
});

// ClaimRewards — withdraw rewards
const fee = await sdk.estimateFee({
  type: "ClaimRewards",
  chain: chains.cardanoMainnet,
  amount: claimableAmount,     // exact lovelace amount to withdraw
  account: PAYMENT_ADDRESS,
  validator: currentDelegation.validator,
  index: 0n,                   // not used in Cardano; required by interface
});
```

---

### `sign`

Signs a Cardano transaction and returns the CBOR hex string ready to broadcast.

Cardano staking requires **two Ed25519 keys** — pass them as `paymentPrivateKey` and `stakingPrivateKey` in the signing args:

```typescript
import type { CardanoSigningWithPrivateKey } from "@guardian-sdk/cardano";

const signingArgs: CardanoSigningWithPrivateKey = {
  transaction,
  fee,
  nonce: 0,                           // always 0 for Cardano
  paymentPrivateKey: "64hexchars...", // 32-byte Ed25519 scalar
  stakingPrivateKey: "64hexchars...", // 32-byte Ed25519 scalar
};

const rawTx = await sdk.sign(signingArgs);
```

`CardanoSigningWithPrivateKey` extends `BaseSignArgs` and is accepted wherever the SDK expects signing arguments.

The SDK:
1. Derives the verification key from each private key
2. Fetches UTXOs and protocol parameters from Blockfrost
3. Builds and CBOR-encodes the transaction body
4. Hashes the body with Blake2b-256
5. Signs the hash with both keys
6. Returns the fully assembled transaction as CBOR hex

---

### `preHash` and `compile`

For **MPC wallets, hardware signers, or custody setups** where private keys are not available in the application process. Splits signing into two steps:

```
  Your App                  SDK                  External Signer (MPC/HSM)
     │                       │                           │
     │  preHash(tx,fee,0)    │                           │
     │ ─────────────────────►│                           │
     │                       │                           │
     │  { serializedTx,      │                           │
     │    signArgs }         │                           │
     │ ◄─────────────────────│                           │
     │                       │                           │
     │  serializedTx (body hex)                          │
     │ ──────────────────────────────────────────────────►
     │                       │                           │
     │  paymentSig, stakingVKey, stakingSig, paymentVKey │
     │ ◄──────────────────────────────────────────────────
     │                       │                           │
     │  compile({signArgs,   │                           │
     │    signature: "a:b:c:d"})                         │
     │ ─────────────────────►│                           │
     │                       │                           │
     │  rawTx (CBOR hex)     │                           │
     │ ◄─────────────────────│                           │
```

**Step 1 — serialise the transaction body:**

```typescript
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction,
  fee,
  nonce: 0,
});

// serializedTransaction is the hex-encoded CBOR transaction body.
// Send it to your external signer. The signer must:
//   1. Decode the hex to bytes
//   2. Hash with Blake2b-256 → 32-byte digest
//   3. Sign digest with payment Ed25519 key  → paymentSig (64 bytes → 128 hex)
//   4. Sign digest with staking Ed25519 key  → stakingSig (64 bytes → 128 hex)
//   5. Return both signatures and both verification keys
```

**Step 2 — compile the signed transaction:**

```typescript
// Encode all witness components into the single signature field using ":" delimiter
const rawTx = await sdk.compile({
  signArgs,
  signature: `${paymentSig}:${stakingVKey}:${stakingSig}:${paymentVKey}`,
  // Format: paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex
  // Each component is a hex string. : is the separator.
});
```

**Step 3 — broadcast:**

```typescript
const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
```

---

## Transaction Flows

Full working examples for each staking operation. All examples share this setup:

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import { cardano, chains } from "@guardian-sdk/cardano";
import type { CardanoSigningWithPrivateKey } from "@guardian-sdk/cardano";

const sdk = new GuardianSDK([
  cardano({ apiKey: "mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX" }),
]);

const PAYMENT_ADDRESS = "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae";
const STAKE_ADDRESS   = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";
const PAYMENT_KEY     = "your64hexcharpaymentprivatekey00000000000000000000000000000000000";
const STAKING_KEY     = "your64hexcharstakingprivatekey00000000000000000000000000000000000";
```

---

### Delegate — register and start staking

Registers the stake key on-chain (2 ADA deposit) and sets the pool to delegate to. The registration and delegation certificates are bundled in a single transaction.

```typescript
const pools = await sdk.getValidators(chains.cardanoMainnet, "Active");
const selectedPool = pools[0];

const transaction = {
  type: "Delegate" as const,
  chain: chains.cardanoMainnet,
  amount: 0n,                       // delegation carries no token amount
  account: PAYMENT_ADDRESS,         // required: used to fetch UTXOs for fee payment
  isMaxAmount: false,
  validator: selectedPool,
};

const fee = await sdk.estimateFee(transaction);
console.log(`Fee: ~${(Number(fee.total) / 1e6).toFixed(4)} ADA`);
console.log(`Deposit: 2 ADA (returned when you deregister)`);
// Wallet needs at least: fee.total + 2_000_000n lovelaces

const signingArgs: CardanoSigningWithPrivateKey = {
  transaction, fee, nonce: 0,
  paymentPrivateKey: PAYMENT_KEY,
  stakingPrivateKey: STAKING_KEY,
};
const rawTx = await sdk.sign(signingArgs);
const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
console.log(`Delegated! https://cardanoscan.io/transaction/${txHash}`);
// First rewards arrive in ~10–15 days
```

> If the stake key is already registered (you have delegated before), the `StakeRegistration` certificate is still included but is harmless on-chain. No second deposit is charged for an already-registered key.

---

### Redelegate — switch pool

Changes the delegation to a different pool. Takes effect at the next epoch boundary. No waiting period, no fee beyond the standard transaction fee.

```typescript
const { delegations } = await sdk.getDelegations(chains.cardanoMainnet, STAKE_ADDRESS);
const currentDelegation = delegations[0];

const pools = await sdk.getValidators(chains.cardanoMainnet, "Active");
const newPool = pools.find((p) => p.operatorAddress !== currentDelegation.validator.operatorAddress)!;

const transaction = {
  type: "Redelegate" as const,
  chain: chains.cardanoMainnet,
  amount: 0n,
  account: PAYMENT_ADDRESS,
  isMaxAmount: false,
  fromValidator: currentDelegation.validator,
  toValidator: newPool,
};

const fee = await sdk.estimateFee(transaction);
const signingArgs: CardanoSigningWithPrivateKey = {
  transaction, fee, nonce: 0,
  paymentPrivateKey: PAYMENT_KEY,
  stakingPrivateKey: STAKING_KEY,
};
const rawTx = await sdk.sign(signingArgs);
const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
console.log(`Pool switched! https://cardanoscan.io/transaction/${txHash}`);
// Old pool earns for remainder of current epoch.
// New pool earns from next epoch.
```

---

### Undelegate — stop staking and recover deposit

Deregisters the stake key. The 2 ADA registration deposit is returned in the same transaction. Stops earning rewards from the next epoch.

> **Claim rewards before undelegating.** Any unclaimed rewards in the reward account are **lost permanently** when the stake key is deregistered.

```typescript
// Step 1: claim any pending rewards first (see Claim flow below)
const balances = await sdk.getBalances(chains.cardanoMainnet, STAKE_ADDRESS);
const claimable = balances.find((b) => b.type === "Claimable")!;
if (claimable.amount > 0n) {
  // claim first — rewards are lost on deregistration
}

// Step 2: deregister
const { delegations } = await sdk.getDelegations(chains.cardanoMainnet, STAKE_ADDRESS);

const transaction = {
  type: "Undelegate" as const,
  chain: chains.cardanoMainnet,
  amount: 0n,
  account: PAYMENT_ADDRESS,
  isMaxAmount: false,
  validator: delegations[0].validator,
};

const fee = await sdk.estimateFee(transaction);
// Net cost = fee.total − 2_000_000n (deposit returned)
console.log(`Net effect: +${((2_000_000n - fee.total) / 1_000_000n).toString()} ADA returned to wallet`);

const signingArgs: CardanoSigningWithPrivateKey = {
  transaction, fee, nonce: 0,
  paymentPrivateKey: PAYMENT_KEY,
  stakingPrivateKey: STAKING_KEY,
};
const rawTx = await sdk.sign(signingArgs);
const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
console.log(`Deregistered! https://cardanoscan.io/transaction/${txHash}`);
```

---

### ClaimRewards — withdraw accumulated rewards

Withdraws accumulated rewards from the reward account to your payment address. Delegation continues uninterrupted.

```typescript
const balances = await sdk.getBalances(chains.cardanoMainnet, STAKE_ADDRESS);
const claimable = balances.find((b) => b.type === "Rewards")!;

if (claimable.amount === 0n) {
  console.log("No rewards available yet. Check back after the next epoch.");
} else {
  const { delegations } = await sdk.getDelegations(chains.cardanoMainnet, STAKE_ADDRESS);

  const transaction = {
    type: "ClaimRewards" as const,
    chain: chains.cardanoMainnet,
    amount: claimable.amount,          // exact lovelace amount to withdraw
    account: PAYMENT_ADDRESS,
    validator: delegations[0].validator,
    index: 0n,                         // unused in Cardano; required by interface
  };

  const fee = await sdk.estimateFee(transaction);
  console.log(`Claiming ${(Number(claimable.amount) / 1e6).toFixed(6)} ADA, fee: ~${(Number(fee.total) / 1e6).toFixed(4)} ADA`);

  const signingArgs: CardanoSigningWithPrivateKey = {
    transaction, fee, nonce: 0,
    paymentPrivateKey: PAYMENT_KEY,
    stakingPrivateKey: STAKING_KEY,
  };
  const rawTx = await sdk.sign(signingArgs);
  const txHash = await sdk.broadcast(chains.cardanoMainnet, rawTx);
  console.log(`Rewards claimed! https://cardanoscan.io/transaction/${txHash}`);
}
```

---

## Signing Flows

See the [main README signing flows diagram](../../README.md#signing-flows) for a visual reference of the direct and MPC signing paths.

Cardano signing always involves two keys and produces two witness entries in the transaction:

| Key | Signs | Why |
|---|---|---|
| Payment key | Transaction body hash | Authorises UTXO consumption (fee payment) |
| Staking key | Transaction body hash | Authorises delegation certificates and reward withdrawals |

Both verification keys are included in the transaction's witness set so validators can verify the signatures on-chain.

---

## Logging

Logging is opt-in — pass a `logger` to `cardano()` to enable it:

```typescript
import { ConsoleLogger } from "@guardian-sdk/sdk";
import { cardano } from "@guardian-sdk/cardano";

const sdk = new GuardianSDK([
  cardano({
    apiKey: "mainnetXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
    logger: new ConsoleLogger("debug"), // "debug" | "info" | "warn" | "error"
  }),
]);
```

Plug in any logger that implements the `Logger` interface (`debug`, `info`, `warn`, `error` methods). See the [main README Logging section](../../README.md#logging) for full details including bring-your-own-logger examples.

> Private keys and signatures are **never** logged at any level.

---

## Error Handling

Every error thrown by the SDK extends `GuardianError`. See the [main README Error Handling section](../../README.md#error-handling) for the catch pattern and base class reference.

### `ValidationError`

Thrown when the caller provides invalid input, before any network call is made.

```typescript
import { ValidationError } from "@guardian-sdk/sdk";
```

| Code | Thrown when |
|---|---|
| `INVALID_ADDRESS` | An address string is not valid bech32 — e.g. a pool ID passed to `getDelegations`, or an enterprise/pointer address passed where a base address or stake address is required |
| `INVALID_AMOUNT` | Insufficient UTXOs to cover the required fee and deposit |
| `INVALID_PRIVATE_KEY` | A key is not 32 bytes (64 hex characters) |

### `SigningError`

Thrown when signing arguments are malformed.

```typescript
import { SigningError } from "@guardian-sdk/sdk";
```

| Code | Thrown when |
|---|---|
| `INVALID_SIGNING_ARGS` | `paymentPrivateKey` or `stakingPrivateKey` missing from signing args |
| `INVALID_SIGNING_ARGS` | `fee.type` is not `"UtxoFee"` — use `estimateFee()` to get a Cardano fee |
| `INVALID_SIGNING_ARGS` | The `signature` string passed to `compile()` does not contain exactly four `:` delimited components |

### `ConfigError`

```typescript
import { ConfigError } from "@guardian-sdk/sdk";
```

| Code | Thrown when |
|---|---|
| `UNSUPPORTED_CHAIN` | The chain passed to any method has no registered service |

### Catching by code

```typescript
import { ValidationError } from "@guardian-sdk/sdk";

try {
  await sdk.getBalances(chains.cardanoMainnet, rawInput);
} catch (err) {
  if (err instanceof ValidationError && err.code === "INVALID_ADDRESS") {
    showError("Please enter a valid stake address (stake1...) or base payment address (addr1q...).");
  }
}
```

---

## Supported Chains

```typescript
import { chains } from "@guardian-sdk/cardano";
```

| Chain | Symbol | Explorer |
|---|---|---|
| Cardano Mainnet | ADA | https://cardanoscan.io |

```typescript
import { SUPPORTED_CHAINS } from "@guardian-sdk/cardano";
// [{ id: "cardano-mainnet", symbol: "ADA", decimals: 6, ... }]
```

## Roadmap

| Feature | Status | Issue |
|---|---|---|
| **`getValidators()` pagination** — Currently returns only the top 20 pools by live stake. Full pagination across all ~3,000 registered pools will be added, along with filtering and sorting options. | Planned | [#42](https://github.com/JaimeToca/guardian-stake-sdk/issues/42) |
| **UTXO pagination beyond 100** — `getUtxos()` fetches a single page of 100 UTXOs. Wallets with more than 100 UTXOs may get an incomplete input set, breaking fee estimation and signing. A lazy strategy will fetch additional pages only when the current set is insufficient. | Planned | [#43](https://github.com/JaimeToca/guardian-stake-sdk/issues/43) |

---

← Back to [Guardian SDK](../../README.md)
