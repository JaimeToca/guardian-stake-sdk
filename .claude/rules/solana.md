# Solana

**Service wiring**: `solana()` accepts a `SolanaConfig` (`rpcUrl`, `logger?`, optional seed-scan / cache / priority-fee knobs), validates `rpcUrl`, creates a thin Kit-based RPC client and a shared stake-position cache, then composes all services. **`getNonce()` is inlined in the factory and always returns `0`** (recent blockhash lives inside tx construction).

**Layer breakdown**:
- `packages/solana/src/solana-chain/index.ts` — `solana()` factory
- `packages/solana/src/chain/index.ts` — `solanaMainnet` chain definition and `chains` registry
- `packages/solana/src/solana-chain/services/` — Service factory functions:
  - `createStakingService` — vote accounts + seed-scanned delegations (shared cache)
  - `createBalanceService` — `Available` / `Staked` / `Pending` / `Claimable` (no `Rewards`)
  - `createFeeService` — builds message → `SolanaFee` (`computeUnits`, `computeUnitPrice`, `total` lamports)
  - `createSignService` — sign / prehash / compile (Ed25519 over message bytes)
  - `createBroadcastService` — `sendTransaction` with base64 wire tx
- `packages/solana/src/solana-chain/rpc/` — thin JSON-RPC wrappers over `@solana/kit` (`createSolanaRpc`)
- `packages/solana/src/solana-chain/state/` — seed derivation, stake decode, activation math, stake cache
- `packages/solana/src/solana-chain/tx/` — `tx-builder.ts`, `solana-types.ts`, `validations.ts`

## The core mental model: authority vs stake account

Native staking is **not** “lock SOL in the wallet.” SOL sits in a **stake account** owned by the Stake program. The wallet is the **authority** (fee payer = staker = withdrawer in v1), not the stake account address.

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

**Position targeting uses `stakeAccount`**, not validator alone. `SolanaUndelegateTransaction` / `SolanaClaimDelegateTransaction` extend the shared types with required `stakeAccount: string` (base58 stake account pubkey) — same package-local extension pattern as Tron’s `resource`. Runtime validation throws if `stakeAccount` is missing even when the consumer typed only the shared `UndelegateTransaction` / `ClaimDelegateTransaction`.

## Lifecycle

```
Delegate (seed N)     create+init+delegate → activating → active (epoch boundary)
  │
Undelegate            Deactivate → deactivating → inactive (epoch + cooldown)
  │
ClaimDelegate         Withdraw all → SOL back to wallet, account closed
```

Rewards **auto-compound** into `delegation.stake` + account lamports — **no `ClaimRewards` tx** and **no `Rewards` balance type**.

Epoch-driven (~2–2.5 days/epoch on mainnet). Activation status is computed client-side from **Delegation + StakeHistory + current epoch** (`getStakeActivation` RPC was removed). Do not reintroduce a reliance on removed RPC methods.

## Seed scheme & discovery

- Base pubkey = user wallet (same as fee payer / staker / withdrawer).
- Seed strings: decimal `"0"`, `"1"`, `"2"`, … (CLI-compatible).
- Owner = Stake program `Stake11111111111111111111111111111111111111`.
- On `Delegate`: find lowest free seed via `findNextFreeSeed`; create there. **No seed field on the tx in v1.**
- Listing (`getDelegations` / `getBalances`): shared **authority → StakePosition[]** cache; on miss, seed-scan with `getMultipleAccounts`, stop after `seedScanGapLimit` consecutive empty slots, cap at `seedScanMax`. Optional `enableGpaFallback` (default **false**) merges GPA results.
- **`getBalances` and `getDelegations` must share the same cache entry** — do not double-fetch on UI dual-calls.
- Invalidation: TTL (`stakeCacheTtlMs`, default 30s). No automatic post-broadcast invalidation required in v1 — document that UIs wait confirmation then re-query after TTL.

## Status mapping

| Derived state | `DelegationStatus` | Balance |
|---|---|---|
| active or **activating** | `Active` | `Staked` |
| deactivating | `Pending` | `Pending` |
| fully inactive with lamports | `Claimable` | `Claimable` |
| zero / closed | omit | — |

- **Activating folds into Active/Staked** in v1 — do not invent a new `DelegationStatus` without a product decision.
- `Delegation.id` = stake account base58; `delegationIndex` = seed index when known.
- `pendingUntil` ≈ next epoch boundary ms when `Pending`, else `0`.
- Placeholder validator when inactive/claimable without voter: `id: "solana-stake-inactive"`, `name: "Inactive stake"`, `status: "Inactive"`, `apy: 0` — always non-null.

## Units — lamports

`1 SOL = 1_000_000_000` lamports (`LAMPORTS_PER_SOL`, `decimals: 9`). All amounts are `bigint` lamports.

## Ops surface (v1)

| SDK type | Instructions | Notes |
|---|---|---|
| `Delegate` | CreateAccountWithSeed + InitializeChecked + DelegateStake | explicit `amount`; **`isMaxAmount: true` rejected**; rent-exempt reserve added on fund |
| `Undelegate` | Deactivate | requires `stakeAccount`; whole account; `amount` ignored |
| `ClaimDelegate` | Withdraw (full / close) | requires `stakeAccount`; never-deactivated → reject; lockup in force → reject (no custodian co-sign) |
| `Redelegate` / `ClaimRewards` / `Vote` | — | `UNSUPPORTED_TRANSACTION_TYPE` |

**`transaction.validator` = vote account pubkey** (what `DelegateStake` needs), not node identity alone.

Rent: query `getMinimumBalanceForRentExemption(200)` — do not hardcode across clusters. Min delegation: `getStakeMinimumDelegation` at runtime.

## Fees — `SolanaFee`

```ts
{ type: "SolanaFee", computeUnits: bigint, computeUnitPrice: bigint, total: bigint }
```

`total` is lamports (base fee + priority; `getFeeForMessage` returns only the base fee, so priority is added explicitly). Sign path rejects non-`SolanaFee` with `INVALID_FEE_TYPE`. Priority from `defaultComputeUnitPrice` / fee’s `computeUnitPrice` (microlamports per CU), **defaulting to `DEFAULT_COMPUTE_UNIT_PRICE` (100_000) when unset** — pass `0n` to opt out.

## Signing (`sign` / `prehash` / `compile`)

Ed25519 over compiled transaction **message bytes** (Kit: compile → `messageBytes`).

- **`sign`** — build message (latest blockhash, fee payer = authority) → sign → return **base64 wire transaction**.
- **`prehash`** — same build; `serializedTransaction` = **base64-encoded message bytes** (digest for external Ed25519 signer — **not** the wire tx). Thread state in `SolanaSignArgs` (`_messageBytes`, `_wireTransaction`) so `compile` does not rebuild.
- **`compile`** — `signature` = **base64 of 64-byte Ed25519 signature**; return base64 wire tx.
- **`broadcast`** — `sendTransaction` base64 wire.

**Private key (v1):** **32-byte Ed25519 seed** as **64-char hex**. Full 64-byte solana-keygen secret-key arrays are out of scope. Single key: fee payer = staker = withdrawer. Do not use the SDK’s secp256k1 `privateKey()` helper for Solana.

## APR / APY — issuance estimate

`Validator.apy` and `stakingSummary.maxApy` are a computed **issuance APY** (percent), not `0`. The pure `computeStakingApy(input)` in `state/apr.ts` does the math: `inflation.validator / stakedFraction × (1 − commission)`, compounded per epoch (`epochsPerYear = SLOTS_PER_YEAR / slotsInEpoch`). Inputs come from `getInflationRate` + `getSupply` + `getEpochInfo` + summed `activatedStake`, fetched best-effort into the validators cache.

**Issuance only** — MEV and priority/block fees are out of scope (documented). On any input-fetch failure the service logs a warning and degrades to `apy 0` / `maxApy 0`; delinquent validators are always `0`. Do not change the shared `Validator.apy` type away from `number` — `0` is the "unavailable/none" sentinel across all chains.

## Dependencies & conventions

- Kit style: `createSolanaRpc` + instruction builders + message compile — **no Kit app client plugins**.
- Sysvars (`Clock`, `StakeHistory`, `Rent`, …) import from **`@solana/sysvars`** — not re-exported by `@solana/kit` index.
- **No classes** — factory functions only (`createXxxService`).
- No Kit types leak into `packages/sdk`. No `any`. Logger injection; no bare `console.log`.

## Worked sample

Runnable flow: `examples/solana-native-staking-sample.ts` — Delegate → getDelegations → Undelegate with `stakeAccount` → documented epoch wait → ClaimDelegate.

**Keep package docs in sync** — when you change balance modelling, signing, fee shapes, status mapping, or seed discovery, update `packages/solana/README.md`.
