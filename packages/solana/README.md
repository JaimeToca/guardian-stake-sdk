# @guardian-sdk/solana — Solana

Native staking support for Solana (stake accounts + vote-account delegation), part of the [Guardian SDK](../../README.md).

Abstracts Solana Kit transaction construction and JSON-RPC behind a clean, type-safe API so you can stake SOL to a validator, deactivate, and withdraw after cooldown without dealing with stake-account layout or activation math directly.

> **Units are lamports.** `1 SOL = 1_000_000_000` lamports (`decimals: 9`). All `amount` fields are `bigint` lamports.

## Table of Contents

- [How Solana Native Staking Works](#how-solana-native-staking-works)
  - [Authority vs stake account](#authority-vs-stake-account)
  - [Lifecycle of a Stake](#lifecycle-of-a-stake)
  - [Seed-derived stake accounts](#seed-derived-stake-accounts)
  - [No claim-rewards / APR](#no-claim-rewards--apr)
  - [Whole-account undelegate & claim](#whole-account-undelegate--claim)
- [Installation](#installation)
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
- [Transaction Flows](#transaction-flows)
- [Signing Flows](#signing-flows)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)

---

## How Solana Native Staking Works

Native staking is **not** “lock SOL in the wallet.” SOL sits in a **stake account** owned by the Stake program. The wallet is the **authority** (staker + withdrawer in v1), not the stake account address.

### Authority vs stake account

```text
Wallet (authority)                    Stake account (per position)
┌──────────────────┐   CreateAccountWithSeed    ┌────────────────────────────┐
│  fee payer       │ ─────────────────────────► │ holds lamports             │
│  staker          │   InitializeChecked        │ Meta.authorized = wallet   │
│  withdrawer      │   DelegateStake            │ delegated to Vote account  │
└──────────────────┘ ◄──── Withdraw (close) ─── └────────────────────────────┘
         │                                                  │
         │                                                  ▼
         │                                          Vote account (validator)
```

**Position targeting:** `Undelegate` and `ClaimDelegate` require a package-local `stakeAccount` field (base58 stake account pubkey) — same pattern as Tron’s `resource` extension. Pass the `delegation.id` returned by `getDelegations`.

### Lifecycle of a Stake

```text
Delegate (seed N)     create+init+delegate → activating → active (epoch boundary)
  │
Undelegate            Deactivate → deactivating → inactive (epoch + cooldown)
  │
ClaimDelegate         Withdraw all → SOL back to wallet, account closed
```

Epoch-driven: roughly **2–2.5 days per epoch** on mainnet. Activation status is computed client-side from Delegation + StakeHistory + current epoch (`getStakeActivation` RPC was removed).

### Seed-derived stake accounts

v1 creates stake accounts only via **`CreateAccountWithSeed`** with CLI-compatible seeds `"0"`, `"1"`, `"2"`, … (base = wallet, owner = Stake program). On `Delegate`, the builder picks the next free seed internally — there is no seed field on the transaction.

Discovery for `getDelegations` / `getBalances` uses the same seed scan (shared short-TTL cache), with optional `getProgramAccounts` fallback (`enableGpaFallback`, default off).

### No claim-rewards / APR

- **Rewards auto-compound** into the stake account — there is no `ClaimRewards` transaction and no `Rewards` balance type.
- **`Validator.apy` is always `0`** in v1 (no inflation/commission APR computation).

### Whole-account undelegate & claim

| Op | Amount rules |
|---|---|
| `Delegate` | Explicit `amount` required; **`isMaxAmount: true` is rejected** |
| `Undelegate` | Whole stake account (`Deactivate`); `amount` ignored; requires `stakeAccount` |
| `ClaimDelegate` | Full withdraw / close; requires fully inactive account + `stakeAccount` |

Partial unstake would need Split (out of scope for v1).

---

## Installation

```bash
npm install @guardian-sdk/solana @guardian-sdk/sdk
```

| Package | Role |
|---|---|
| [`@guardian-sdk/sdk`](https://www.npmjs.com/package/@guardian-sdk/sdk) | Peer — chain-agnostic core, shared types and interfaces |
| `@solana/kit` / `@solana/sysvars` | Dependencies — RPC, messages, signing |
| `@solana-program/stake` / `@solana-program/system` | Dependencies — stake & system instruction builders |

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import {
  solana,
  chains,
  LAMPORTS_PER_SOL,
  type SolanaUndelegateTransaction,
} from "@guardian-sdk/solana";

const sdk = new GuardianSDK([
  solana({ rpcUrl: process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com" }),
]);

const ADDRESS = process.env.SOLANA_ADDRESS!;
const PRIVATE_KEY = process.env.SOLANA_PRIVATE_KEY!; // 32-byte Ed25519 seed, 64-char hex

// 1. Browse vote accounts (validators)
const { data: validators } = await sdk.getValidators(chains.solanaMainnet);
const voteAccount = validators[0].operatorAddress; // vote pubkey for Delegate

// 2. Stake 1 SOL
const delegate = {
  type: "Delegate" as const,
  chain: chains.solanaMainnet,
  amount: 1n * LAMPORTS_PER_SOL,
  isMaxAmount: false,
  validator: voteAccount,
  account: ADDRESS,
};
const fee = await sdk.estimateFee(delegate);
const rawTx = await sdk.sign({ transaction: delegate, fee, nonce: 0, privateKey: PRIVATE_KEY });
await sdk.broadcast(chains.solanaMainnet, rawTx);

// 3. List positions (delegation.id === stake account)
const { delegations } = await sdk.getDelegations(chains.solanaMainnet, ADDRESS);
const stakeAccount = delegations[0].id;

// 4. Start unstake (whole account)
const undelegate: SolanaUndelegateTransaction = {
  type: "Undelegate",
  chain: chains.solanaMainnet,
  amount: 0n,
  isMaxAmount: false,
  stakeAccount,
  account: ADDRESS,
};
```

Full runnable sample: [`examples/solana-native-staking-sample.ts`](../../examples/solana-native-staking-sample.ts).

---

## API Reference

### `solana()`

Factory function. Returns a `GuardianServiceContract` for Solana mainnet.

```typescript
function solana(config: SolanaConfig): GuardianServiceContract

interface SolanaConfig {
  rpcUrl: string;
  logger?: Logger;
  /** Microlamports per compute unit for priority fee (default 0). */
  defaultComputeUnitPrice?: bigint;
  /** Stop seed scan after this many consecutive missing accounts (default 5). */
  seedScanGapLimit?: number;
  /** Hard max seed index to probe inclusive (default 50). */
  seedScanMax?: number;
  /** TTL for authority → stake positions cache (default 30_000). */
  stakeCacheTtlMs?: number;
  /** TTL for the full vote-accounts list cache (default 180_000). */
  validatorsCacheTtlMs?: number;
  /** Heavy getProgramAccounts reconciliation (default false). */
  enableGpaFallback?: boolean;
}
```

---

### `getValidators`

Returns vote accounts from `getVoteAccounts` (`current` + `delinquent`). The full vote list is cached for ~3 minutes (`validatorsCacheTtlMs`), then sliced in memory for `page` / `pageSize`.

```typescript
const { data, pagination } = await sdk.getValidators(chains.solanaMainnet);
const page2 = await sdk.getValidators(chains.solanaMainnet, { page: 2, pageSize: 50 });
```

**Returns:** `Promise<ValidatorsPage>`

```typescript
interface Validator {
  id: string;                      // vote account address
  status: ValidatorStatus;         // "Active" (current) | "Inactive" (delinquent)
  name: string;                    // best-effort / short form
  description: string;
  image: undefined;
  apy: number;                     // always 0 in v1
  delegators: number;
  operatorAddress: string;         // vote account — use in transaction.validator
  creditAddress: string;           // ""
}
```

> **`transaction.validator` must be the vote account pubkey**, not the node identity alone. That is what `DelegateStake` needs.

---

### `getDelegations`

Discovers seed-derived stake accounts for the authority, computes activation client-side, and maps each position to a `Delegation`.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(chains.solanaMainnet, ADDRESS);
```

**Returns:** `Promise<Delegations>`

```typescript
interface Delegation {
  id: string;                   // stake account base58 pubkey
  validator: Validator;         // vote-backed when delegated; placeholder when inactive
  amount: bigint;               // lamports — actionable figure for this status
  status: DelegationStatus;     // Active | Pending | Claimable
  delegationIndex: bigint;      // seed index when known, else 0n
  pendingUntil: number;         // estimated epoch boundary ms when Pending, else 0
}
```

| Derived state | `status` | Balance type |
|---|---|---|
| active or **activating** | `Active` | `Staked` |
| deactivating | `Pending` | `Pending` |
| fully inactive with lamports | `Claimable` | `Claimable` |

> Activating stake is folded into **`Active` / `Staked`** in v1 (no separate `DelegationStatus`).

> **Placeholder validator** (inactive / claimable without voter): `id: "solana-stake-inactive"`, `name: "Inactive stake"`, `status: "Inactive"`, `apy: 0` — always non-null.

#### `stakingSummary`

| Field | Source |
|---|---|
| `totalProtocolStake` | Σ activated stake from vote accounts |
| `maxApy` | `0` |
| `minAmountToStake` | `getStakeMinimumDelegation` |
| `unboundPeriodInMillis` | ~1 epoch wall-time estimate (approximate) |
| `redelegateFeeRate` | `0` |
| `activeValidators` | `current.length` |
| `totalValidators` | current + delinquent |

---

### `getBalances`

| `BalanceType` | Source |
|---|---|
| `Available` | `getBalance(wallet)` lamports |
| `Staked` | Σ Active / activating positions |
| `Pending` | Σ deactivating |
| `Claimable` | Σ fully inactive withdrawable |

**`Rewards` is not returned** — rewards auto-compound into the stake account. No double-counting: a lamport in `Pending` is not also in `Staked`.

`getBalances` and `getDelegations` **share the same stake-position cache** so a UI calling both does not double RPC load. Cache TTL defaults to 30s; after a stake-mutating broadcast, wait for confirmation and allow TTL expiry (or re-query after TTL).

---

### `getNonce`

Always returns `0`. Solana uses a recent blockhash inside the transaction message, not an account nonce.

---

### `estimateFee`

Returns a **`SolanaFee`** (not `GasFee` / `UtxoFee` / `ResourceFee`).

```typescript
interface SolanaFee {
  type: "SolanaFee";
  /** Estimated compute units for the message. */
  computeUnits: bigint;
  /** Priority: microlamports per compute unit (0 = no priority fee). */
  computeUnitPrice: bigint;
  /** Total expected fee in lamports for the fee payer. */
  total: bigint;
}
```

Sign path rejects a non-`SolanaFee` with `INVALID_FEE_TYPE`.

---

### `sign`

Builds the transaction message (latest blockhash, fee payer = authority), signs with the Ed25519 keypair from `privateKey`, and returns a **base64 wire transaction** string for `broadcast`.

**Private key format (v1):** **32-byte Ed25519 seed** as **64-character hex** (optionally `0x`-prefixed depending on callers — store as 64 hex chars). Full 64-byte solana-keygen secret-key arrays are **out of scope**; extract the first 32 bytes (seed) if converting from a keypair file.

---

### `prehash` and `compile`

| Method | Behavior |
|---|---|
| `prehash` | Builds the same message; `serializedTransaction` = **base64-encoded message bytes** (exact bytes an external Ed25519 signer must sign — **not** the wire transaction). Unsigned state is threaded in `SolanaSignArgs` (`_messageBytes` / `_wireTransaction`). |
| `compile` | `signature` = **base64 of the 64-byte Ed25519 signature** over those message bytes; returns **base64 wire transaction** |
| `broadcast` | `sendTransaction` with the base64 wire tx |

---

## Transaction Flows

| User intent | SDK `Transaction` | On-chain instructions |
|---|---|---|
| Stake SOL to a validator | `Delegate` | `CreateAccountWithSeed` + `InitializeChecked` + `DelegateStake` |
| Start unstake | `Undelegate` (`SolanaUndelegateTransaction`) | `Deactivate` |
| Withdraw after cooldown | `ClaimDelegate` (`SolanaClaimDelegateTransaction`) | `Withdraw` (full / close) |

### Solana-only extensions

```typescript
interface SolanaUndelegateTransaction extends UndelegateTransaction {
  /** Base58 stake account pubkey to deactivate. */
  stakeAccount: string;
}

interface SolanaClaimDelegateTransaction extends ClaimDelegateTransaction {
  /** Base58 stake account pubkey to withdraw/close. */
  stakeAccount: string;
}
```

### Unsupported in v1

| Type | Behavior |
|---|---|
| `Redelegate` | `UNSUPPORTED_TRANSACTION_TYPE` (on-chain Redelegate never activated; multi-epoch product flow later) |
| `ClaimRewards` | `UNSUPPORTED_TRANSACTION_TYPE` (rewards auto-compound) |
| `Vote` | `UNSUPPORTED_TRANSACTION_TYPE` (not a delegator action on Solana) |

Also out of scope: Split / Merge / MoveStake, setting / managing lockup, custodian co-sign, dual authorities (staker ≠ withdrawer), ephemeral stake keypairs, liquid staking.

### `Delegate` notes

- `validator` = **vote account** pubkey (string).
- `amount` = stake lamports; builder adds rent-exempt reserve to funded lamports.
- Next free seed chosen internally.
- `isMaxAmount: true` → `ValidationError`.
- Preflight: rejects when authority balance cannot cover `amount + rent + fee cushion`.

### `Undelegate` / `ClaimDelegate` notes

- `stakeAccount` is **required** at runtime (throws if missing even if typed only as the shared type).
- Whole-account only; `amount` is ignored for instruction construction.
- Undelegate rejects when the account is not an active delegated Stake (already deactivating/inactive or never delegated).
- Claim rejects never-deactivated Stake (`deactivationEpoch === u64::MAX`); residual cooldown is enforced on-chain.
- Claim rejects when Meta lockup is in force (`unixTimestamp > now` or `epoch > current epoch`). Custodian co-sign is not supported in v1.

---

## Signing Flows

Same surface as other chains: direct `sign({ privateKey })` or MPC `prehash` → external sign → `compile`.

```typescript
// MPC / hardware
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction: delegate,
  fee,
  nonce: 0,
});
// serializedTransaction = base64 message bytes — Ed25519-sign these bytes externally
const signatureBase64 = /* external 64-byte Ed25519 sig, base64 */;
const rawTx = await sdk.compile({ signArgs, signature: signatureBase64 });
await sdk.broadcast(chains.solanaMainnet, rawTx);
```

Near epoch boundaries, `sendTransaction` may fail with epoch-rewards-related errors — retry after the window.

---

## Logging

Silent by default. Pass a `Logger` (e.g. `ConsoleLogger`) into `solana({ logger })`. Private keys and signatures are never logged.

---

## Error Handling

Errors extend `GuardianError` (`ValidationError`, `ConfigError`, `SigningError`) re-exported from this package.

| Code | Typical cause |
|---|---|
| `INVALID_ADDRESS` | Bad base58 authority / stake / vote address |
| `INVALID_AMOUNT` | Non-positive amount, `isMaxAmount: true` on Delegate, below min delegation |
| `INVALID_FEE` / `INVALID_FEE_TYPE` | Bad fee or non-`SolanaFee` on sign |
| `INVALID_PRIVATE_KEY` | Seed not 32-byte hex |
| `UNSUPPORTED_TRANSACTION_TYPE` | Redelegate / ClaimRewards / Vote |
| `UNSUPPORTED_OPERATION` | Missing `stakeAccount`, wrong activation state, etc. |

---

## Supported Chains

| Chain | id | symbol | decimals |
|---|---|---|---|
| Solana mainnet | `solana-mainnet` | `SOL` | 9 |

Explorer: https://explorer.solana.com
