# @guardian-sdk/solana — Solana

Native staking support for Solana (stake accounts + vote-account delegation), part of the [Guardian SDK](../../README.md).

Abstracts Solana Kit transaction construction, stake-account discovery, client-side activation math, and JSON-RPC behind a clean, type-safe API so you can stake SOL to a validator, deactivate, and withdraw after cooldown — without dealing with create-with-seed derivation, StakeHistory warmup/cooldown, or wire formats yourself.

> **Units are lamports.** `1 SOL = 1_000_000_000` lamports (`decimals: 9`). All `amount` fields are `bigint` lamports.

> **Multi-account by design.** Unlike Cardano’s single stake key, Solana stake is **one on-chain account per position**. A wallet can hold many stake accounts; undelegate and withdraw target a **specific** stake account pubkey (`stakeAccount`), not “the wallet’s stake” as a whole.

## Table of Contents

- [How Solana Native Staking Works](#how-solana-native-staking-works)
  - [Compared to BSC, Cardano, and Tron](#compared-to-bsc-cardano-and-tron)
  - [Authority vs stake account](#authority-vs-stake-account)
  - [Vote accounts (validators)](#vote-accounts-validators)
  - [Lifecycle of a Stake](#lifecycle-of-a-stake)
  - [Epochs, activation, and cooldown](#epochs-activation-and-cooldown)
  - [Rewards auto-compound (no ClaimRewards)](#rewards-auto-compound-no-claimrewards)
  - [Seed-derived stake accounts](#seed-derived-stake-accounts)
  - [Multiple stake accounts — when and how to track them](#multiple-stake-accounts--when-and-how-to-track-them)
  - [Whole-account undelegate & claim](#whole-account-undelegate--claim)
  - [APR / APY in v1](#apr--apy-in-v1)
- [Installation](#installation)
  - [Dependencies](#dependencies)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [solana()](#solana)
  - [getValidators](#getvalidators)
  - [getDelegations](#getdelegations)
  - [getBalances](#getbalances)
  - [getNonce](#getnonce)
  - [estimateFee](#estimatefee)
  - [sign](#sign)
  - [prehash and compile](#prehash-and-compile)
  - [broadcast](#broadcast)
- [Transaction Flows](#transaction-flows)
  - [Delegate — create seed account and stake](#delegate--create-seed-account-and-stake)
  - [Undelegate — deactivate a stake account](#undelegate--deactivate-a-stake-account)
  - [ClaimDelegate — withdraw after cooldown](#claimdelegate--withdraw-after-cooldown)
  - [Multiple claimable positions](#multiple-claimable-positions)
- [Signing Flows](#signing-flows)
- [Caching and discovery](#caching-and-discovery)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)
- [Roadmap / out of scope](#roadmap--out-of-scope)

---

## How Solana Native Staking Works

Solana native staking is a **delegation of lamports held inside stake accounts** to a validator’s **vote account**. There is no ERC-20 share token (unlike BSC StakeCredit), no “freeze for ENERGY/BANDWIDTH” split (unlike Tron), and no UTXO-style “nothing locks” model (unlike Cardano). The SOL you stake **moves into a stake account**; that account is owned by the Stake program and is what earns rewards.

### Compared to BSC, Cardano, and Tron

| Topic | **Solana (this package)** | BSC | Cardano | Tron |
|---|---|---|---|---|
| What holds stake | **Stake account(s)** per position | StakeCredit shares per validator | Nothing locked — stake key preference | `frozenV2` on the account |
| Wallet address role | **Authority** (staker + withdrawer) | Delegator EOA | Payment + stake addresses | Owner TRX address |
| Position handle for unstake/claim | **`stakeAccount` pubkey** (`delegation.id`) | `validator` + unbond **`index`** | Stake key / pool id | Resource-granular entries; claim often ignores validator |
| Multiple positions | **Common** — one account per stake | Multiple unbond requests + multi-validator | Usually one stake key | Multiple frozen/unfreeze rows |
| Unbonding | **~1+ epoch** deactivate then withdraw | **~7 days** then `ClaimDelegate` | **None** | **14 days** then claim principal |
| Rewards | **Auto-compound** into stake account | Auto-compound via share price | Separate **`ClaimRewards`** | Separate **`ClaimRewards`** (24h cooldown) |
| `ClaimRewards` in SDK | **Unsupported** (not needed) | Unsupported | Supported | Supported |
| `Vote` in SDK | **Unsupported** | Unsupported | Unsupported | **Required** after freeze to earn TRX |
| `Redelegate` in SDK | **Unsupported** (on-chain Redelegate never activated) | Supported | Supported | Unsupported |
| Partial unstake | **Not in v1** (needs Split) | Partial via shares | N/A (no lock) | **Partial unfreeze allowed** |
| `isMaxAmount` | **Rejected** on Delegate | Used on some ops | Used on some ops | **Rejected** (like Solana) |
| Fee shape | **`SolanaFee`** (CU + priority) | `GasFee` | `UtxoFee` | `ResourceFee` |
| `getNonce` | Always **`0`** (blockhash in message) | Real EVM nonce | Always `0` | Always `0` |
| Signing | **Ed25519**, single key (v1) | secp256k1 | **Two** Ed25519 keys | secp256k1 |
| APR in v1 | **`apy: 0`** always | From BNB metadata API | From pool metadata | **Computed** from witnesses |
| Package extension fields | `stakeAccount` on undelegate/claim | — | — | `resource` on freeze/unfreeze |

**Takeaways for multi-chain UIs:**

1. Treat Solana like **BSC unbond indexes** or **Tron resource rows**: list positions from `getDelegations`, then pass a **position id** into undelegate/claim — not only the wallet address.
2. Do **not** offer a “claim rewards” button for Solana native stake (unlike Cardano/Tron).
3. Do **not** expect a single atomic redelegate (unlike BSC/Cardano); product flow is deactivate → wait → withdraw → new delegate (or later MoveStake, out of scope).

### Authority vs stake account

Native staking is **not** “lock SOL in the wallet.” SOL sits in a **stake account** owned by the Stake program. The wallet is the **authority** (fee payer, staker, and withdrawer in v1), **not** the stake account address.

```text
Wallet (authority)                         Stake account (per position)
┌──────────────────┐  CreateAccountWithSeed   ┌────────────────────────────┐
│  fee payer       │ ───────────────────────► │ holds lamports             │
│  staker          │  InitializeChecked        │ Meta.authorized = wallet   │
│  withdrawer      │  DelegateStake            │ delegated to Vote account  │
└──────────────────┘ ◄──── Withdraw (close) ── └────────────────────────────┘
         │                                                    │
         │                                                    ▼
         │                                            Vote account (validator)
```

| Address | What it is | Used for |
|---|---|---|
| **Wallet / authority** | User’s main key | `getBalances(address)`, `getDelegations(address)`, `transaction.account`, fee payer |
| **Stake account** | Separate account, often seed-derived | Holds staked SOL; target of Deactivate / Withdraw |
| **Vote account** | Validator consensus identity | `transaction.validator` on `Delegate` (`operatorAddress` from `getValidators`) |

**Position targeting:** `Undelegate` and `ClaimDelegate` require package-local **`stakeAccount`** (base58 stake account pubkey) — same extension pattern as Tron’s `resource`. Pass `delegation.id` from `getDelegations`.

### Vote accounts (validators)

On Solana, “validators” for delegators are **vote accounts**, not node identity alone. `getValidators()` uses `getVoteAccounts` and sets:

- `id` / `operatorAddress` = **vote account** address  
- `status` = `"Active"` if in `current`, `"Inactive"` if delinquent  
- `creditAddress` = `""` (no BSC-style credit contract)  
- `apy` = `0` in v1  

Always pass the **vote pubkey** as `Delegate.validator`.

### Lifecycle of a Stake

```text
Delegate (seed N)
  CreateAccountWithSeed + InitializeChecked + DelegateStake
        │
        ▼
  activating ──(epoch boundary, ≤9%/epoch cluster cap)──► active
        │                                                    │
        │                                              Undelegate (Deactivate)
        │                                                    │
        │                                                    ▼
        │                                              deactivating
        │                                                    │
        │                         (epoch boundary + cooldown)│
        │                                                    ▼
        │                                              fully inactive
        │                                                    │
        │                                            ClaimDelegate (Withdraw)
        │                                                    │
        └──────────────────────────────────────────► SOL in wallet; account closed
```

| Stage | SDK `DelegationStatus` | Balance bucket | User action |
|---|---|---|---|
| Activating or fully active | `Active` | `Staked` | Wait / later `Undelegate` |
| Deactivating | `Pending` | `Pending` | Wait for cooldown |
| Fully inactive, lamports remain | `Claimable` | `Claimable` | `ClaimDelegate` with `stakeAccount` |
| Closed (zeroed) | omitted from list | — | — |

**Minimum path to get SOL back after an active stake:**  
`Undelegate` → wait until status is `Claimable` → `ClaimDelegate`. Two user transactions, two epochs of wall time at least in the happy path (often ~2–5 days depending when you land in the epoch).

### Epochs, activation, and cooldown

- **1 epoch ≈ 432,000 slots ≈ 2–2.5 days** on mainnet.
- Stake changes take effect at **epoch boundaries**.
- Warmup / cooldown rate is cluster-wide (**~9% per epoch** after the reduce-warmup feature). Small stakes usually become fully active/inactive after **one** boundary if cluster churn is low.
- **`getStakeActivation` RPC was removed.** This package **computes** effective / activating / deactivating from the stake account, the **StakeHistory** sysvar, and the current epoch (same algorithm the runtime uses).

Near the **start of an epoch**, partitioned reward distribution can temporarily block stake mutations — retry broadcast if you see epoch-rewards-related failures.

### Rewards auto-compound (no ClaimRewards)

When rewards are paid, they are **added to both** the stake account’s lamports and `delegation.stake`. There is:

- **No** separate reward account to drain (unlike Cardano)  
- **No** `WithdrawBalance`-style claim (unlike Tron)  
- **No** `Rewards` entry from `getBalances()`  
- **`ClaimRewards` transaction type → unsupported**

MEV / Jito tips are **not** native stake rewards and are outside this package.

### Seed-derived stake accounts

v1 creates stake accounts **only** via Kit’s **`createAddressWithSeed`** / System `CreateAccountWithSeed` with CLI-compatible seeds `"0"`, `"1"`, `"2"`, …:

- **Base** = wallet (authority)  
- **Owner** = Stake program  
- **Seed string** = decimal index  

On `Delegate`, the builder picks the **next free seed** (first index whose derived address has no account). There is **no** seed field on the transaction object.

**Discovery** (`getDelegations` / `getBalances`):

1. Shared in-memory cache per authority (default TTL **30s**)  
2. Seed-scan `0 … seedScanMax` (default max **50**), stop after `seedScanGapLimit` consecutive empty slots (default **5**)  
3. Optional heavy `getProgramAccounts` (staker memcmp) if `enableGpaFallback: true` — finds stake accounts **not** created with our seed scheme (other wallets/apps)

### Multiple stake accounts — when and how to track them

#### When you get more than one

| Situation | Result |
|---|---|
| User stakes twice (two `Delegate` txs) | Seeds `"0"` and `"1"` (or next free) — **two** stake accounts |
| Stake to different validators | Still one account per position (often one account per validator) |
| Unstake only one of several | Other accounts stay `Active` |
| Full withdraw closes an account | Seed index can be **reused** by a later `Delegate` |
| Wallet also used Phantom / CLI / other app | Extra accounts may exist; seed-scan alone can **miss** them unless `enableGpaFallback` |

#### Do you need multiple withdrawals?

**Yes**, if several accounts are `Claimable`. Each `ClaimDelegate` withdraws **one** stake account. There is no “claim all” batch in this package (similar to BSC not implementing `claimBatch` — one claim per unbond index).

```text
getDelegations(wallet)
  ├── id=StakeA  status=Claimable  → ClaimDelegate { stakeAccount: StakeA }
  ├── id=StakeB  status=Pending    → wait
  └── id=StakeC  status=Active     → optional Undelegate { stakeAccount: StakeC }
```

#### How to keep track (product recipe)

1. **Source of truth:** `getDelegations(chain, wallet)` after each confirmed mutation (or after cache TTL).  
2. **Stable handle:** `delegation.id` === stake account base58 — store this for undelegate/claim, not only seed index.  
3. **Seed index:** `delegation.delegationIndex` when discovered via seed-scan (useful for support/debug; do not rely on it alone if GPA-found accounts use `0n`).  
4. **Totals:** `getBalances` for Available / Staked / Pending / Claimable sums.  
5. **UI:** one row per delegation; actions disabled until status allows (e.g. Withdraw only when `Claimable`).

`getBalances` alone is **not** enough to withdraw — you must know **which** `stakeAccount` to pass.

### Whole-account undelegate & claim

| Op | Amount rules |
|---|---|
| `Delegate` | Explicit `amount` (stake lamports); builder adds **rent-exempt reserve**; **`isMaxAmount: true` rejected** |
| `Undelegate` | **Whole** stake account (`Deactivate`); `amount` ignored; **`stakeAccount` required** |
| `ClaimDelegate` | **Full** withdraw / close; `amount` ignored; **`stakeAccount` required** |

Partial unstake would require **Split** (out of scope for v1). For comparison: Tron allows partial unfreeze; Cardano does not “lock” principal at all.

### APR / APY in v1

`Validator.apy` and `stakingSummary.maxApy` are always **`0`**. Do not show a fake yield. Inflation + commission APR can be added later from live RPC (`getInflationRate`, vote commission) — intentionally skipped in v1 (same spirit as shipping without every BSC batch feature).

---

## Installation

```bash
npm install @guardian-sdk/solana @guardian-sdk/sdk
# or
pnpm add @guardian-sdk/solana @guardian-sdk/sdk
```

### Dependencies

| Package | Role |
|---|---|
| [`@guardian-sdk/sdk`](https://www.npmjs.com/package/@guardian-sdk/sdk) | **Peer** — chain-agnostic contracts, shared `Transaction` / `Balance` / `Fee` types |
| `@solana/kit` | RPC, addresses (`createAddressWithSeed`), codecs, signers, transaction messages |
| `@solana/sysvars` | Clock / StakeHistory (and sysvar addresses) |
| `@solana-program/stake` | Stake instruction builders + stake state codec |
| `@solana-program/system` | `CreateAccountWithSeed` and system instructions |

No `@solana/web3.js` — this package is Kit-native.

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import {
  solana,
  chains,
  LAMPORTS_PER_SOL,
  type SolanaUndelegateTransaction,
  type SolanaClaimDelegateTransaction,
} from "@guardian-sdk/solana";

const sdk = new GuardianSDK([
  solana({
    rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com",
  }),
]);

const ADDRESS = process.env.SOLANA_ADDRESS!;
/** 32-byte Ed25519 seed as 64 hex characters (not a full 64-byte keypair file). */
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!;

// 1. Validators (vote accounts). apy is 0 in v1.
const { data: validators } = await sdk.getValidators(chains.solanaMainnet);
const voteAccount = validators[0]!.operatorAddress;

// 2. Stake 1 SOL → creates seed account + delegates in one tx
const delegate = {
  type: "Delegate" as const,
  chain: chains.solanaMainnet,
  amount: 1n * LAMPORTS_PER_SOL,
  isMaxAmount: false,
  validator: voteAccount,
  account: ADDRESS,
};
const fee = await sdk.estimateFee(delegate);
const rawTx = await sdk.sign({
  transaction: delegate,
  fee,
  nonce: 0,
  privateKey: PRIVATE_KEY,
});
const sig = await sdk.broadcast(chains.solanaMainnet, rawTx);
console.log(`Delegated: https://explorer.solana.com/tx/${sig}`);

// 3. List positions — one Delegation per stake account
const { delegations } = await sdk.getDelegations(chains.solanaMainnet, ADDRESS);
for (const d of delegations) {
  console.log(d.status, d.id, d.amount, d.validator.operatorAddress);
}
const stakeAccount = delegations[0]!.id; // use as stakeAccount for undelegate/claim

// 4. Start unstake (whole account)
const undelegate: SolanaUndelegateTransaction = {
  type: "Undelegate",
  chain: chains.solanaMainnet,
  amount: 0n, // ignored
  isMaxAmount: false,
  stakeAccount,
  account: ADDRESS,
};
const undelegateFee = await sdk.estimateFee(undelegate);
const undelegateRaw = await sdk.sign({
  transaction: undelegate,
  fee: undelegateFee,
  nonce: 0,
  privateKey: PRIVATE_KEY,
});
await sdk.broadcast(chains.solanaMainnet, undelegateRaw);

// 5. After status becomes Claimable (epoch wait), withdraw
const claim: SolanaClaimDelegateTransaction = {
  type: "ClaimDelegate",
  chain: chains.solanaMainnet,
  amount: 0n, // ignored
  stakeAccount,
  account: ADDRESS,
};
// estimateFee → sign → broadcast same as above
```

Full runnable sample: [`examples/solana-native-staking-sample.ts`](../../examples/solana-native-staking-sample.ts).

---

## API Reference

### `solana()`

Factory. Returns a plain `GuardianServiceContract` for Solana mainnet (no facade class).

```typescript
function solana(config: SolanaConfig): GuardianServiceContract

interface SolanaConfig {
  rpcUrl: string;
  logger?: Logger;
  /** Microlamports per CU for priority fee ixs (default 0). */
  defaultComputeUnitPrice?: bigint;
  /** Stop seed scan after N consecutive missing accounts (default 5). */
  seedScanGapLimit?: number;
  /** Inclusive max seed index to probe (default 50). */
  seedScanMax?: number;
  /** Authority → stake positions cache TTL ms (default 30_000). */
  stakeCacheTtlMs?: number;
  /** Full vote-accounts list cache TTL ms (default 180_000). */
  validatorsCacheTtlMs?: number;
  /** getProgramAccounts by staker — heavy; default false. */
  enableGpaFallback?: boolean;
}
```

```typescript
const sdk = new GuardianSDK([solana({ rpcUrl: "https://api.mainnet-beta.solana.com" })]);
```

---

### `getValidators`

Reads `getVoteAccounts` (`current` + `delinquent`). The **full** list is cached (~3 minutes by default), then **paginated in memory**.

```typescript
const { data, pagination } = await sdk.getValidators(chains.solanaMainnet);
const page2 = await sdk.getValidators(chains.solanaMainnet, { page: 2, pageSize: 50 });
```

**Returns:** `Promise<ValidatorsPage>`

```typescript
interface Validator {
  id: string;                 // vote account
  status: ValidatorStatus;    // "Active" | "Inactive" (delinquent)
  name: string;
  description: string;
  image: undefined;
  apy: number;                // always 0 in v1
  delegators: number | undefined;
  operatorAddress: string;    // vote account — use as Delegate.validator
  creditAddress: string;      // always ""
}
```

---

### `getDelegations`

Discovers stake accounts for the authority, runs **client-side activation**, returns **one `Delegation` per stake account**.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(
  chains.solanaMainnet,
  ADDRESS
);
```

```typescript
interface Delegation {
  id: string;                 // stake account base58 — pass as stakeAccount
  validator: Validator;       // never null
  amount: bigint;             // lamports for this position
  status: DelegationStatus;   // Active | Pending | Claimable
  delegationIndex: bigint;    // seed index when known
  pendingUntil: number;       // approx epoch-boundary ms when Pending, else 0
}
```

| Derived state | `status` | `amount` meaning (actionable) | Balance type |
|---|---|---|---|
| active or **activating** | `Active` | effective + activating (or delegated stake) | `Staked` |
| deactivating | `Pending` | deactivating lamports | `Pending` |
| fully inactive w/ balance | `Claimable` | withdrawable (typically full lamports) | `Claimable` |

> **Activating** is folded into `Active` / `Staked` in v1 (no separate status). Activating stake is not yet earning; still show it as staked principal.

> **Placeholder validator** when inactive/claimable without a voter:  
> `id: "solana-stake-inactive"`, `name: "Inactive stake"`, `status: "Inactive"`, `apy: 0` — always non-null (same idea as Tron’s Frozen placeholder).

#### Every shape `getDelegations()` can return

Amounts in SOL for readability (SDK returns lamports).

**1. Single active stake**
```
on-chain: seed0 delegated to VoteA, fully active
→ [ Active  amount=…  id=Stake0  validator=VoteA ]
```

**2. Two stakes (two Delegate txs)**
```
→ [ Active  id=Stake0  VoteA ]
  [ Active  id=Stake1  VoteB ]
```

**3. One deactivating, one still active**
```
→ [ Active   id=Stake0  VoteA ]
  [ Pending  id=Stake1  VoteA  pendingUntil≈… ]
```

**4. Ready to withdraw**
```
→ [ Claimable  id=Stake1  amount=…  validator=placeholder or last voter ]
```

**Invariants for a clean wallet (seed-only positions):**  
`Σ Staked + Σ Pending + Σ Claimable` matches the stake-side of `getBalances` (Available is liquid wallet SOL only).

#### `stakingSummary`

| Field | Source |
|---|---|
| `totalProtocolStake` | Σ activated stake from vote accounts |
| `maxApy` | `0` |
| `minAmountToStake` | `getStakeMinimumDelegation` |
| `unboundPeriodInMillis` | ~1 epoch wall-time **estimate** (approximate) |
| `redelegateFeeRate` | `0` |
| `activeValidators` | `current.length` |
| `totalValidators` | current + delinquent |

---

### `getBalances`

| `BalanceType` | Source | Same as |
|---|---|---|
| `Available` | `getBalance(wallet)` | BSC/Cardano/Tron liquid |
| `Staked` | Σ active + activating positions | BSC Active, Tron frozen (conceptually) |
| `Pending` | Σ deactivating | BSC/Tron unbonding |
| `Claimable` | Σ fully inactive withdrawable | BSC/Tron matured unbond principal |
| `Rewards` | **Not returned** | Cardano/Tron only |

No double-counting: lamports in `Pending` are not also in `Staked`.

`getBalances` and `getDelegations` **share one stake-position cache** (default 30s TTL).

---

### `getNonce`

Always returns **`0`**. Solana messages use a **recent blockhash** (fetched at build time), not an account nonce. Same pattern as Cardano and Tron.

---

### `estimateFee`

Returns **`SolanaFee`** — Solana’s fee model is neither EVM gas, Cardano UTxO, nor Tron bandwidth.

```typescript
interface SolanaFee {
  type: "SolanaFee";
  computeUnits: bigint;       // static budget per op class (v1)
  computeUnitPrice: bigint;   // microlamports per CU (from config / fee)
  total: bigint;              // lamports — from getFeeForMessage on the built message
}
```

- Message includes optional compute-budget ixs when `computeUnitPrice > 0`.  
- `total` comes from **`getFeeForMessage`** (already includes prioritization when CU price ixs are present — do not double-count).  
- Sign rejects non-`SolanaFee` with `INVALID_FEE_TYPE`.

Typical static CU budgets (implementation defaults): Delegate higher than Undelegate/Claim (create+init+delegate is multi-ix).

---

### `sign`

Builds the message (latest blockhash, fee payer = authority), signs with Ed25519, returns **base64 wire transaction** for `broadcast`.

| | Solana | BSC | Cardano | Tron |
|---|---|---|---|---|
| Curve | Ed25519 | secp256k1 | Ed25519 ×2 | secp256k1 |
| Keys | **One** seed (v1) | One | payment + staking | One |
| Output | base64 wire tx | signed hex tx | CBOR hex | JSON signed tx |

**Private key (v1):** **32-byte Ed25519 seed** as **64 lowercase hex** characters.  
Full 64-byte solana-keygen secret arrays are **out of scope** — use the 32-byte seed only.

`transaction.account` must match the address derived from `privateKey` when both are provided.

---

### `prehash` and `compile`

MPC / hardware path (same contract as other chains; payload differs):

| Method | Solana meaning |
|---|---|
| `prehash` | `serializedTransaction` = **base64 of compiled message bytes** (what Ed25519 signs) — **not** the wire tx. Threads `_messageBytes` / `_wireTransaction` on `SolanaSignArgs`. |
| `compile` | `signature` = **base64 of 64-byte Ed25519 signature**; returns **base64 wire tx** |
| `broadcast` | `sendTransaction` with base64 wire |

Compare: Tron prehash returns **txID** (secp256k1 digest); Cardano returns **Blake2b-256 body hash**; BSC returns RLP preimage.

```typescript
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction: delegate,
  fee,
  nonce: 0,
});
// Ed25519-sign the bytes decoded from serializedTransaction (message bytes)
const signatureBase64 = /* external 64-byte sig as base64 */;
const rawTx = await sdk.compile({ signArgs, signature: signatureBase64 });
await sdk.broadcast(chains.solanaMainnet, rawTx);
```

---

### `broadcast`

```typescript
const signature = await sdk.broadcast(chains.solanaMainnet, rawTx);
// signature is base58 transaction signature for explorers
```

---

## Transaction Flows

| User intent | SDK type | On-chain instructions |
|---|---|---|
| Stake SOL | `Delegate` | `CreateAccountWithSeed` + `InitializeChecked` + `DelegateStake` (+ optional CU budget) |
| Start unstake | `SolanaUndelegateTransaction` | `Deactivate` |
| Withdraw principal | `SolanaClaimDelegateTransaction` | `Withdraw` (full balance / close) |

### Solana-only extensions

```typescript
interface SolanaUndelegateTransaction extends UndelegateTransaction {
  stakeAccount: string; // required
}

interface SolanaClaimDelegateTransaction extends ClaimDelegateTransaction {
  stakeAccount: string; // required
}
```

`Delegate` uses the shared `DelegateTransaction` (`validator` = vote account). Seed selection is internal.

### Unsupported types (throw)

| Type | Why |
|---|---|
| `Redelegate` | On-chain Redelegate ix never activated; real path is multi-epoch or MoveStake (later) |
| `ClaimRewards` | Rewards auto-compound |
| `Vote` | Not a delegator action on Solana (contrast Tron) |

Also out of scope: Split / Merge / MoveStake / MoveLamports, lockup setup, custodian co-sign, dual authorities (staker ≠ withdrawer), ephemeral stake keypairs, liquid staking / stake pools, `DeactivateDelinquent`.

### Delegate — create seed account and stake

```typescript
const tx = {
  type: "Delegate" as const,
  chain: chains.solanaMainnet,
  amount: 2n * LAMPORTS_PER_SOL, // stake body; rent added by builder
  isMaxAmount: false,
  validator: voteAccountPubkey,
  account: wallet,
};
```

- Rejects `isMaxAmount: true`, `amount ≤ 0`, below `getStakeMinimumDelegation`.  
- Prefund check: wallet must cover `amount + rent + fee cushion`.  
- Rent-exempt reserve is **not** delegated; only lamports above reserve are staked.

### Undelegate — deactivate a stake account

```typescript
const tx: SolanaUndelegateTransaction = {
  type: "Undelegate",
  chain: chains.solanaMainnet,
  amount: 0n,
  isMaxAmount: false,
  stakeAccount: delegation.id,
  account: wallet,
};
```

- Rejects missing/invalid `stakeAccount`, non–stake-program owner, wrong staker, already inactive/deactivating.

### ClaimDelegate — withdraw after cooldown

```typescript
const tx: SolanaClaimDelegateTransaction = {
  type: "ClaimDelegate",
  chain: chains.solanaMainnet,
  amount: 0n,
  stakeAccount: delegation.id,
  account: wallet,
};
```

- Requires fully inactive stake (never-deactivated accounts rejected client-side; residual cooldown also enforced on-chain).  
- Rejects **lockup in force** (unix timestamp or epoch lockup). Custodian co-sign is **not** supported in v1.  
- Withdraws **all** lamports to the authority and closes the account when empty.

### Multiple claimable positions

```typescript
const { delegations } = await sdk.getDelegations(chains.solanaMainnet, wallet);
const claimable = delegations.filter((d) => d.status === "Claimable");

for (const d of claimable) {
  const tx: SolanaClaimDelegateTransaction = {
    type: "ClaimDelegate",
    chain: chains.solanaMainnet,
    amount: 0n,
    stakeAccount: d.id,
    account: wallet,
  };
  const fee = await sdk.estimateFee(tx);
  const raw = await sdk.sign({ transaction: tx, fee, nonce: 0, privateKey });
  await sdk.broadcast(chains.solanaMainnet, raw);
}
```

Same loop pattern as claiming several BSC unbond indexes one-by-one.

---

## Signing Flows

| Flow | Steps |
|---|---|
| Direct | `estimateFee` → `sign({ privateKey })` → `broadcast` |
| MPC / HSM | `estimateFee` → `preHash` → external Ed25519 over message bytes → `compile` → `broadcast` |

Always pass `nonce: 0` (ignored for chain state; required by shared sign args).

---

## Caching and discovery

| Cache | Default TTL | Key |
|---|---|---|
| Stake positions | 30s | authority address |
| Vote accounts | 3 min | single list, then page |

- Shared between `getDelegations` and `getBalances`.  
- After a successful stake-mutating tx: wait for confirmation, then re-query (or wait for TTL).  
- `enableGpaFallback: true` only if you must see non-seed stake accounts — **expensive** and often rate-limited by RPC providers.

---

## Logging

Silent by default (`NoopLogger`). Pass `logger` into `solana({ logger })`. Private keys and signatures are never logged.

---

## Error Handling

Errors extend `GuardianError` (`ValidationError`, `ConfigError`, `SigningError`) re-exported from this package / `@guardian-sdk/sdk`.

| Code | Typical cause |
|---|---|
| `INVALID_ADDRESS` | Bad authority / stake / vote address; wrong stake authority |
| `INVALID_AMOUNT` | Non-positive Delegate amount, `isMaxAmount: true`, below min delegation, insufficient balance |
| `INVALID_FEE` / `INVALID_FEE_TYPE` | Fee estimate failed or non-`SolanaFee` on sign |
| `INVALID_SIGNING_ARGS` | Bad private key format, missing prehash state, bad signature length |
| `UNSUPPORTED_TRANSACTION_TYPE` | Redelegate / ClaimRewards / Vote |
| `UNSUPPORTED_OPERATION` | Missing `stakeAccount`, wrong activation state, lockup in force, no free seed, etc. |

---

## Supported Chains

| Chain | `id` | symbol | decimals | explorer |
|---|---|---|---|---|
| Solana mainnet | `solana-mainnet` | `SOL` | 9 | https://explorer.solana.com |

```typescript
import { chains, solanaMainnet } from "@guardian-sdk/solana";
// chains.solanaMainnet === solanaMainnet
```

---

## Roadmap / out of scope

Intentionally **not** in v1 (may land later):

| Feature | Notes |
|---|---|
| APR / APY | Live inflation + commission |
| Split / partial undelegate | Enables partial unstake without whole-account deactivate |
| Merge / MoveStake / MoveLamports | Instant rebalance / dust cleanup |
| Product redelegate | Multi-tx UX after deactivate |
| Dual authority / lockup UI | Custody patterns |
| Ephemeral stake keypairs | Multi-sig create (worse MPC story than seeds) |
| GPA-default discovery | Opt-in only today |
| Activating as distinct status | Currently folded into Active |
| Liquid staking / stake pools | Different product surface |

Keep this README in sync when you change balance modelling, signing, fee shapes, or delegation mapping (same discipline as Cardano / Tron).
