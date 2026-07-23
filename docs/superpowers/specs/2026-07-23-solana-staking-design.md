# Solana Native Staking — Design Spec

**Date:** 2026-07-23  
**Package:** `packages/solana` → `@guardian-sdk/solana`  
**Status:** Design (brainstorming complete; implementation gated on approval of this spec)

## 1. Purpose & Scope

Add a fourth chain package implementing `GuardianServiceContract` for **Solana native staking**
(stake accounts + vote-account delegation), mirroring the BSC / Cardano / Tron package pattern.

**In scope (v1):** `getValidators`, `getDelegations`, `getBalances`, `getNonce`, `estimateFee`,
`sign` / `prehash` / `compile`, `broadcast`, `getChainInfo`. Staking operations:

| User intent | SDK `Transaction` | On-chain instructions |
|-------------|-------------------|------------------------|
| Stake SOL to a validator | `Delegate` | `CreateAccountWithSeed` + `InitializeChecked` + `DelegateStake` |
| Start unstake | `Undelegate` (`SolanaUndelegateTransaction`) | `Deactivate` |
| Withdraw after cooldown | `ClaimDelegate` (`SolanaClaimDelegateTransaction`) | `Withdraw` (full balance / close) |

**Out of scope (v1):**

- APR / APY computation (`Validator.apy` always `0`)
- `Redelegate` (on-chain Redelegate never activated; multi-epoch product flow later)
- `ClaimRewards` (native rewards **auto-compound** into the stake account)
- `Vote` (not a delegator action on Solana)
- Split / Merge / MoveStake / MoveLamports
- Lockup / custodian
- Dual authorities (staker ≠ withdrawer)
- Ephemeral stake keypairs (random new account that must co-sign create)
- Liquid staking / stake pools
- `DeactivateDelinquent`

**Research basis:**

- Local Solana Kit checkout (`@solana/kit` 7.x) + Codama clients `@solana-program/stake`, `@solana-program/system`
- `solana-native-staking-internals.md` (account layout, activation algorithm, instruction wire format)
- `test-staking` (product flow: create + init + delegate; implemented in legacy web3.js — reimplement with Kit)
- Guardian contracts + Tron design as the latest chain-addition template

## 2. Locked Decisions

| Decision | Choice |
|---|---|
| Architecture | **Approach 1** — Tron-shaped package on Kit (factory + services + thin RPC; no Kit app client plugins) |
| Stake account model | **Seed-derived only** (`CreateAccountWithSeed` / CLI-compatible seeds `"0"`, `"1"`, …) |
| Op surface | Minimal loop: **Delegate → Undelegate → ClaimDelegate** + reads |
| Position targeting | Package-local **`stakeAccount: string`** on undelegate/claim (Tron `resource` pattern) |
| Fee model | New shared **`SolanaFee`** |
| Signing | **Single `privateKey`**: fee payer = staker = withdrawer |
| Amounts | **Strict:** Delegate requires explicit `amount` (`isMaxAmount` rejected); undelegate/claim are whole-account |
| Discovery | **Seed-scan first** + short TTL cache; optional GPA fallback (default off) |
| APR | Skipped (`apy: 0`) |
| `getNonce` | Always `0` (blockhash lives inside tx construction) |
| Activating stake | Mapped to **`Active` / `Staked`** (no new `DelegationStatus` in v1) |

## 3. Mental Model

Native staking is **not** “lock SOL in the wallet.” SOL sits in a **stake account** owned by the
Stake program. The wallet is the **authority** (staker + withdrawer in v1), not the stake account address.

```
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

**Lifecycle:**

```
Delegate (seed N)     create+init+delegate → activating → active (epoch boundary)
  │
Undelegate            Deactivate → deactivating → inactive (epoch + cooldown)
  │
ClaimDelegate         Withdraw all → SOL back to wallet, account closed
```

Rewards auto-compound into `delegation.stake` + account lamports — **no claim-rewards tx**.

Epoch-driven: ~2–2.5 days/epoch. Activation status must be computed client-side from
**Delegation + StakeHistory + current epoch** (`getStakeActivation` RPC was removed).

## 4. Architecture

```
packages/solana/src/
  chain/
    index.ts                      → solanaMainnet, chains, getChainById
  solana-chain/
    index.ts                      → solana(config) → GuardianServiceContract
    rpc/
      solana-rpc-client.ts        → createSolanaRpc wrappers
      solana-rpc-client-contract.ts
      solana-rpc-types.ts
    state/
      seed.ts                     → with-seed address derivation, next-free-seed, scan
      activation.ts               → StakeHistory effective/activating/deactivating (§7)
      stake-account.ts            → decode + position model
      stake-cache.ts              → shared authority → StakePosition[] cache
    tx/
      tx-builder.ts               → SDK Transaction → Kit message / instructions
      solana-types.ts             → Solana* extensions, SolanaSignArgs
      validations.ts
    services/
      staking-service.ts
      balance-service.ts
      fee-service.ts
      sign-service.ts
      broadcast-service.ts
  index.ts                        → re-exports @guardian-sdk/sdk + chain + Solana types
```

**Dependencies:**

```json
{
  "@guardian-sdk/sdk": "workspace peer",
  "@solana/kit": "^7",
  "@solana/sysvars": "^7",
  "@solana-program/system": "^0.13",
  "@solana-program/stake": "^0.8"
}
```

Prefer **library style** (`createSolanaRpc` + instruction builders + `pipe(createTransactionMessage…)`)
over Kit client plugins. Sysvars are **not** re-exported by `@solana/kit` index — import
`@solana/sysvars` explicitly for Clock / StakeHistory / Rent / EpochRewards.

**Factory (`solana()`):** validate `rpcUrl` → RPC client → shared stake cache → compose services →
plain object. No classes. `getNonce` inlined to `0`.

### Config

```ts
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
  /** TTL for validators page cache (default 180_000). */
  validatorsCacheTtlMs?: number;
  /** Heavy getProgramAccounts reconciliation (default false). */
  enableGpaFallback?: boolean;
}
```

## 5. Shared SDK Changes

These touch `packages/sdk` and require README / doc-drift care.

1. **`GuardianChainType` / `ChainEcosystemType`** gain `"Solana"`.

2. **`Fee` / `FeeType`** gain **`SolanaFee`**:

```ts
export interface SolanaFee {
  type: "SolanaFee";
  /** Estimated compute units for the message (after simulation or static budget). */
  computeUnits: bigint;
  /** Priority: microlamports per compute unit (0 = no priority fee). */
  computeUnitPrice: bigint;
  /** Total expected fee in lamports for the fee payer. */
  total: bigint;
}
```

3. **No new `Transaction` discriminants** in v1.  
4. **No new `DelegationStatus`** in v1 (activating folds into `Active`).  
5. **`privateKey()` helper remains secp256k1-only** — Solana uses Ed25519; document hex key format
   in the Solana package (same pattern as Cardano not using `privateKey()`).

## 6. Package-Local Types

```ts
// packages/solana/.../tx/solana-types.ts
export interface SolanaUndelegateTransaction extends UndelegateTransaction {
  /** Base58 stake account pubkey to deactivate. */
  stakeAccount: string;
}

export interface SolanaClaimDelegateTransaction extends ClaimDelegateTransaction {
  /** Base58 stake account pubkey to withdraw/close. */
  stakeAccount: string;
}

/**
 * Thread unsigned message through prehash → compile (mirrors Tron `_rawTx`).
 * Implementation must store enough to reattach signatures without rebuilding
 * (compiled message bytes + required signer address list / partial signature map).
 */
export interface SolanaSignArgs extends BaseSignArgs {
  /** Compiled transaction message bytes (Ed25519 sign payload). */
  _messageBytes?: Uint8Array;
  /** Base64 wire-ready skeleton or Kit partial-sign map; exact field set is internal. */
  _wireTransaction?: string;
}
```

- **`Delegate`** stays the shared `DelegateTransaction` (`validator` required at runtime = **vote account** pubkey).
- Next free seed is chosen internally; no seed field on the tx in v1.
- Runtime validation throws if `stakeAccount` is missing on undelegate/claim (even if consumer typed only `UndelegateTransaction`).

## 7. Transaction Taxonomy

| SDK type | Solana instructions | Notes |
|---|---|---|
| `Delegate` | System `CreateAccountWithSeed` + Stake `InitializeChecked` + `DelegateStake` (+ optional compute budget) | `amount` = stake lamports; builder adds rent-exempt reserve to funded lamports; `isMaxAmount: true` → `ValidationError` |
| `Undelegate` | `Deactivate` | Requires `stakeAccount`; `amount` ignored; whole account |
| `ClaimDelegate` | `Withdraw` (full withdrawable / close) | Requires `stakeAccount`; account must be fully inactive (and lockup not in force — lockup out of scope / reject if in force) |
| `Redelegate` | — | `UNSUPPORTED_TRANSACTION_TYPE` |
| `ClaimRewards` | — | `UNSUPPORTED_TRANSACTION_TYPE` |
| `Vote` | — | `UNSUPPORTED_TRANSACTION_TYPE` |

**Checked instruction variants** by default (`InitializeChecked`).

**Rent:** query `getMinimumBalanceForRentExemption(200)` (cache long TTL); do not hardcode across clusters
(mainnet reference ≈ 2_282_880 lamports).

**Min delegation:** `getStakeMinimumDelegation` at runtime for summary / validation; do not hardcode.

## 8. Seed Scheme & Discovery

### Creation

- Base pubkey = user wallet (same as fee payer / staker / withdrawer).
- Seed strings: decimal `"0"`, `"1"`, `"2"`, … (CLI-compatible).
- Owner = Stake program `Stake11111111111111111111111111111111111111`.
- On `Delegate`: find lowest seed whose derived address has no account (or is not a stake account we manage); create there.

### Listing (`getDelegations` / `getBalances`)

1. Check **shared stake-position cache** for `authority`.
2. On miss: **seed-scan** from `0` to `seedScanMax`, batching `getMultipleAccounts`.
3. Stop after `seedScanGapLimit` consecutive empty slots (still scan up to max if gaps are intentional — v1: consecutive gap stop is enough).
4. Decode each account; keep only stake accounts where `authorized.staker` (and v1: withdrawer) matches authority.
5. Fetch **Clock + StakeHistory** once per refresh; compute activation for each position.
6. If `enableGpaFallback`: optional `getProgramAccounts` memcmp staker@offset 12, `dataSize: 200`, merge any missing addresses into the set (log if seeds missed accounts).
7. Write cache with `stakeCacheTtlMs`.

`getBalances` and `getDelegations` **must share the same cache entry** so a UI calling both does not double the RPC load.

### Invalidation

- TTL expiry (primary).
- Best-effort: no automatic invalidation after `broadcast` required in v1 (document that UIs should wait confirmation then allow TTL or call again after TTL). Optional later: `cache.delete(authority)` after successful broadcast of stake-mutating txs.

## 9. Activation & Status Mapping

Port the stake activating/deactivating algorithm from the internals doc (§7) / Solana SDK
`Delegation::stake_activating_and_deactivating`. Inputs: account delegation fields, StakeHistory
sysvar, current epoch, warmup/cooldown rate (mainnet: **0.09** post feature; parameterize for tests).

Derived per position: `{ effective, activating, deactivating }` lamports + status.

| Derived state | `DelegationStatus` | Contributes to balance |
|---|---|---|
| active or activating | `Active` | `Staked` |
| deactivating | `Pending` | `Pending` |
| fully inactive with lamports | `Claimable` | `Claimable` |
| zero / closed | omit | — |

- **`pendingUntil`:** estimate next epoch boundary millis when status is `Pending` (from `getEpochInfo` / schedule); else `0`.
- **`Delegation.id`:** stake account base58 pubkey.
- **`Delegation.amount`:** actionable figure — for Active/Pending prefer delegated/effective+activating+deactivating as appropriate; for Claimable prefer withdrawable lamports (typically full balance when fully inactive).
- **`delegationIndex`:** seed index as `bigint` when known, else `0n`.
- **`validator`:** real vote-account-backed `Validator` when delegated; placeholder when inactive/claimable without voter (non-null always).

**Placeholder validator** (inactive / claimable without voter):  
`id: "solana-stake-inactive"`, `name: "Inactive stake"`, `status: "Inactive"`, `apy: 0`,
`operatorAddress: ""`, `creditAddress: ""`.

## 10. `getValidators`

- Source: `getVoteAccounts` (`current` + `delinquent`).
- Map: `id` / `operatorAddress` = **vote account** address (what `DelegateStake` needs — not node identity alone).
- `status`: `Active` if in `current`, else `Inactive` (delinquent).
- `apy: 0` (v1).
- `creditAddress: ""`.
- `name` / `description` / `image`: best-effort empty or vote pubkey short form unless a free metadata source is trivial — do not block v1 on validator metadata APIs.
- Pagination: in-memory page over cached full list (like other chains).
- Cache: `validatorsCacheTtlMs` (default 3 minutes).

**`stakingSummary`:**

| Field | Source |
|---|---|
| `totalProtocolStake` | Σ activated stake from vote accounts (lamports as number — same pattern as other chains’ number fields) |
| `maxApy` | `0` |
| `minAmountToStake` | `getStakeMinimumDelegation` |
| `unboundPeriodInMillis` | ~1 epoch wall time estimate (e.g. from epoch schedule × slot duration heuristic) — document as approximate |
| `redelegateFeeRate` | `0` |
| `activeValidators` | `current.length` |
| `totalValidators` | current + delinquent |

## 11. `getBalances(address)`

| `BalanceType` | Source |
|---|---|
| `Available` | `getBalance(wallet)` lamports |
| `Staked` | Σ positions Active/activating (delegated stake amounts as defined in §9) |
| `Pending` | Σ deactivating |
| `Claimable` | Σ fully inactive withdrawable |
| `Rewards` | **not returned** (auto-compound; no separate claimable rewards balance) |

No double-counting: a lamport in Pending is not also in Staked.

## 12. Fee Estimation (`SolanaFee`)

1. Build the same instruction set as sign (without requiring private key for fee estimate when possible; fee payer = `transaction.account` required for message).
2. Set compute unit limit (static budget per op class **or** simulate via Kit resource estimation).
3. Apply `computeUnitPrice` from config default (or `0`).
4. `getFeeForMessage` / signature fee + priority (`CU × price / 1e6`) → `total` lamports.
5. Return `{ type: "SolanaFee", computeUnits, computeUnitPrice, total }`.

Sign path rejects non-`SolanaFee` with `INVALID_FEE_TYPE`.

## 13. Signing (`sign` / `prehash` / `compile`)

Ed25519 over compiled transaction **message bytes** (Kit: `compileTransaction` → `messageBytes`).

| Method | Behavior |
|---|---|
| `sign` | Build message (latest blockhash, fee payer = authority) → sign with keypair from `privateKey` → return **base64 wire transaction** string for `broadcast` |
| `prehash` | Build same message; `serializedTransaction` = **base64-encoded message bytes** (the exact bytes the external Ed25519 signer must sign — not the wire transaction). Thread full unsigned message/tx state in `SolanaSignArgs` so compile does not rebuild. |
| `compile` | `signature` arg = **base64 of the 64-byte Ed25519 signature** over message bytes; attach for fee payer/authority → return **base64 wire transaction** |
| `broadcast` | `sendTransaction` with base64 wire tx |

**Private key format (v1):** **32-byte Ed25519 seed** as **64-character lowercase hex** (same length convention as Cardano staking keys in this monorepo). Reject other lengths with a clear `SigningError`. Full 64-byte solana-keygen secret-key arrays are **out of scope** for v1 (document how to extract the 32-byte seed if needed).

**Blockhash:** fetched at build time; durable nonce out of scope.

**Epoch rewards window:** document retry guidance if broadcast fails near epoch boundary (`EpochRewardsActive`); optional automatic retry is nice-to-have, not required for v1.

## 14. Validations

| Op | Rules |
|---|---|
| `Delegate` | `validator` required (vote pubkey); `amount > 0`; `isMaxAmount === false` only (reject true); `amount ≥ minDelegation`; `account` required; wallet has enough for `amount + rent + fees` (fee path may check loosely; sign path should not silently underfund) |
| `Undelegate` | `stakeAccount` required; account exists; authority matches; not already deactivating/inactive as appropriate (deactivate only when active/activating per program rules) |
| `ClaimDelegate` | `stakeAccount` required; fully inactive; withdrawer = authority; reject if lockup in force |
| Unsupported types | `UNSUPPORTED_TRANSACTION_TYPE` |

## 15. Testing

Follow other chains: **realistic fixtures** (explorer / mainnet account data shapes), not toy mock layouts.

| Area | Coverage |
|---|---|
| `activation.ts` | Table-driven: bootstrap `u64::MAX`, same-epoch delegate+deactivate, uncapped warmup, capped cooldown, pruned history |
| Seed derivation | Known base + seed → known stake address |
| Stake decode | Real base64 stake account fixtures (`initialized` / `delegated` / deactivating) |
| `getDelegations` / balances | Fixture RPC → expected statuses and aggregates; cache hit does not re-fetch |
| Fee | Built message → `SolanaFee` shape; wrong fee type rejected on sign |
| Sign / prehash / compile | Build each op → prehash digest stable; compile(signature) matches sign path wire form; assert like Cardano/Tron round-trips |
| Validations | `isMaxAmount`, missing `stakeAccount`, unsupported types |
| Validators | `getVoteAccounts` fixture pagination |

Prefer decoding against `@solana-program/stake` codecs and/or known CLI `solana stake-account` vectors over inventing field layouts.

## 16. Example

`examples/solana-native-staking-sample.ts`:

1. Configure `solana({ rpcUrl })` + `GuardianSDK`
2. `getValidators` → pick a vote account
3. `Delegate` amount → sign → broadcast
4. `getDelegations` → show stake account id / Active
5. `Undelegate` with `stakeAccount` from delegation
6. (Document epoch wait) `ClaimDelegate` with same `stakeAccount`

## 17. Package Plumbing

- Scaffold via `python3 scripts/scaffold_chain.py solana --symbol SOL --no-viem` then reshape to §4 (or hand-create following Tron).
- Root build: **sdk → solana** alongside bsc/cardano/tron.
- ESLint project entries, `examples/tsconfig` path aliases.
- Root `CLAUDE.md` / `Claude.md`: add Solana package + Kit deps; note no viem in solana.
- `.claude/rules/solana.md` — mental model, seed scheme, status mapping, stakeAccount extension, caching, signing (first-class deliverable like Tron).
- `packages/solana/README.md` — tables + samples; keep in sync on public type changes.

## 18. Units & Chain Constants

```ts
export const solanaMainnet: GuardianChain = {
  id: "solana-mainnet",
  type: "Solana",
  symbol: "SOL",
  decimals: 9,
  ecosystem: "Solana",
  chainId: undefined,
  explorer: "https://explorer.solana.com",
};
```

`1 SOL = 1_000_000_000` lamports.

## 19. Explicit Non-Goals / Future

| Item | Notes |
|---|---|
| APR | Use `getInflationRate` / commission later |
| Split for partial undelegate | Would enable partial unstake without full account deactivate |
| MoveStake | Instant rebalance same authorities |
| Dual authority / custody | Extend sign args like Cardano |
| Ephemeral stake keys | Multi-sig create; worse MPC story |
| GPA-default discovery | Available via `enableGpaFallback` for power users |
| Activating as distinct status | Only if product needs it; would add `DelegationStatus` or UI-only field |

## 20. Implementation Notes for Agents

- Factory functions only — **no classes**.
- No cross-package leaks of Kit into `packages/sdk`.
- No `any`; narrow `unknown`.
- Logger injection; no bare `console.log`.
- Commits: logical units (sdk types → package scaffold → state/activation → services → sign → tests/docs).
- Verification: `pnpm run build`, `typecheck`, `test`, `lint` at milestones; realistic sign/prehash/compile tests.
- Prefer seed path for create so **one signature** always suffices.

## 21. Decision Trace (brainstorming)

| Topic | Decision |
|---|---|
| Stake account creation | A — seed-derived only |
| v1 ops | A — minimal native loop |
| Position handle | Solana tx extensions with `stakeAccount` |
| Fee | A — `SolanaFee` |
| Keys | A — single private key |
| Amounts | A — strict / whole-account undelegate & claim |
| Discovery | A — seed-scan + cache (+ optional GPA) |
| Architecture | Approach 1 — Tron-shaped Kit package |
```
