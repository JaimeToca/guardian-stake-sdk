# Solana staking APY (issuance estimate) — Design

**Date:** 2026-07-24
**Package:** `@guardian-sdk/solana`
**Status:** Approved, pending implementation plan

## Problem

Solana v1 hardcodes `Validator.apy` and `stakingSummary.maxApy` to `0` (see `.claude/rules/solana.md` "No APR"). Consumers can list validators and delegations but have no yield signal to rank or display. This adds a computed, forward-looking **issuance APY** per validator using only plain-RPC data.

## Scope

**In scope:** Issuance (inflation) reward minus validator commission, compounded per-epoch to an APY, computed from `getInflationRate`, `getSupply`, `getEpochInfo`, and the `getVoteAccounts` data already fetched.

**Explicitly out of scope (v1):** MEV tips and block/priority fees. These require Jito APIs and block-production data that a plain Solana RPC cannot cheaply provide, and would add external HTTP dependencies and per-validator fan-out. Live data (epoch 1006) shows MEV is currently only ~**0.10 pp**, so the issuance APY lands within ~0.1 pp of an independent delegator-facing total (Helius's own validator: ours ~5.65% vs their `total_apy` 5.63%). A future "APY parity" project can layer MEV/block rewards on top.

## Decisions (from brainstorming)

1. **Method:** inflation estimate (not realized `getInflationReward`, not performance-adjusted by vote credits).
2. **Reward scope:** issuance only, commission-adjusted, **compounded per-epoch to an APY** (the `Validator.apy` field is named for it, and explorers report the compounded figure).
3. **Failure behavior:** best-effort — degrade to `apy 0` / `maxApy 0`, never break `getValidators` / `getDelegations` / `getBalances`.
4. **`apy` remains `number`.** Returning `undefined` was considered but rejected: the shared `Validator.apy` type is non-nullable and every chain uses `0` as the "unknown/none" sentinel (BSC has an internal `number | null` but flattens to `?? 0` at the public boundary). Changing the shared type would be a breaking change across all four chains. Instead we keep `0` and **log a warning on degradation** so operators can distinguish "APY unavailable" from "APY genuinely ~0".
5. **Always on:** no config flag. The inputs are three extra RPC calls (`getInflationRate` + `getSupply` + `getEpochInfo`) cached under the existing validators TTL.

## The formula

`getInflationRate` returns an **annual** rate; the only extra math is per-epoch compounding, using `epochsPerYear` derived from `getEpochInfo().slotsInEpoch`.

```text
totalActivatedStake = Σ activatedStake over current + delinquent vote accounts   (lamports)
totalSupply         = getSupply().total                                          (lamports)
stakedFraction      = totalActivatedStake / totalSupply                          (0 < f ≤ 1)
networkApr          = inflationRate.validator / stakedFraction                    (annual fraction)
validatorApr        = networkApr × (1 − commissionPercent / 100)                  (annual fraction)
validatorApy(%)     = ((1 + validatorApr / epochsPerYear) ^ epochsPerYear − 1) × 100
```

**We compound APR → APY** because (a) the SDK field is named `apy`, and (b) Solana rewards compound every epoch, so the compounded figure is what explorers report. `epochsPerYear = SLOTS_PER_YEAR / slotsInEpoch`, where `slotsInEpoch` comes from `getEpochInfo()` and `SLOTS_PER_YEAR` is derived from the ~2-day epoch cadence (≈182). `epochsPerYear` is clamped to a sane minimum of `1` so a degenerate `slotsInEpoch` can't produce a nonsense exponent.

Worked example (validated live, epoch 1006, 0% commission): validator inflation `0.0373`, staked fraction `0.678` →
`0.0373 / 0.678 = 0.0550` APR → compounded over ~182 epochs → **≈ 5.65% APY**. Helius's own validator (0% commission) reported `total_apy` **5.63%** the same day — a ~0.02 pp match.

### Guards (never emit NaN / Infinity / negative)

`computeStakingApy` receives `stakedFraction` (already divided), not raw supply — so a zero/negative supply surfaces here as a non-finite `stakedFraction`.

- `commissionPercent` clamped to `[0, 100]`.
- `epochsPerYear` clamped to a minimum of `1` (guards a degenerate `slotsInEpoch`).
- Return `0` unless `stakedFraction` is a **finite number in `(0, ∞)`** and `inflationValidatorRate ≥ 0`.
- Return `0` if the compounded result is non-finite or negative.

The service computes `stakedFraction = Number(totalActivatedStake) / Number(totalSupply)`; when `totalSupply` is `0n` this yields `Infinity`/`NaN`, which the finite-fraction guard maps to `0`.

### Status rules

- **`current`** validators → computed APY.
- **`delinquent`** validators → `apy 0` (not currently producing rewards; an "estimated" positive APY would mislead).
- **`stakingSummary.maxApy`** = APY of the lowest-commission *current* validator, i.e. `computeStakingApy` with `commissionPercent = minCommission` over current validators. Delinquent excluded.

## Architecture

### New pure function — `state/apr.ts`

```ts
export interface StakingApyInput {
  inflationValidatorRate: number; // annual fraction, e.g. 0.0373
  stakedFraction: number;         // 0 < f ≤ 1
  commissionPercent: number;      // 0..100
  epochsPerYear: number;          // compounding periods, ~182 (clamped ≥ 1)
}

/** Issuance APY as a percent (per-epoch compounded), clamped to a finite [0, ∞). */
export function computeStakingApy(input: StakingApyInput): number;
```

Mirrors Tron's exported, table-tested `computeApr`. No RPC, no I/O — pure and independently testable.

### New RPC methods — `SolanaRpcClientContract`

```ts
getInflationRate(): Promise<{ total: number; validator: number; foundation: number; epoch: bigint }>;
getSupply(): Promise<{ total: bigint; circulating: bigint }>;
```

Implemented in `solana-rpc-client.ts` over Kit's `rpc.getInflationRate()` / `rpc.getSupply()`. `getSupply` is called with `{ excludeNonCirculatingAccountsList: true }` so the node omits the (large) non-circulating account address list we don't use; only `value.total` / `value.circulating` are read. Added to **every** existing test mock of the contract.

New/extended RPC result types live in `solana-rpc-types.ts` (`InflationRate`, `Supply`).

### `createStakingService` wiring

- `loadVoteAccounts()` becomes `loadValidatorInputs()` returning a combined cached object:
  ```ts
  interface ValidatorInputs {
    voteAccounts: VoteAccountsResult;
    // undefined = degraded (APY inputs unavailable this load)
    apy:
      | { inflationValidatorRate: number; stakedFraction: number; epochsPerYear: number }
      | undefined;
  }
  ```
  Fetched together (`getVoteAccounts`, `getInflationRate`, `getSupply`, `getEpochInfo`) and stored under the existing `VALIDATORS_CACHE_KEY` with the existing `validatorsCacheTtlMs` (~3 min).
- The inflation + supply + epoch-info fetch is wrapped in try/catch. On failure: `logger.warn(...)`, `apy = undefined`.
- `epochsPerYear = SLOTS_PER_YEAR / Number(slotsInEpoch)`, clamped to `≥ 1`. `SLOTS_PER_YEAR = 78_894_000` — Solana's protocol constant (2.5 ideal slots/sec × seconds/year), the same basis the runtime uses to annualize epoch rewards; added to `state/constants.ts`.
- `mapVoteToValidator(vote, status, apyInputs)` computes `apy` via `computeStakingApy` when `status === "Active"` and `apyInputs` is defined; otherwise `apy: 0`.
- `stakingSummary.maxApy` computed from `apyInputs` + min commission across current validators; `0` when `apyInputs` is undefined or there are no current validators.
- `getDelegations` already resolves validators through `validatorMap`/`mapVoteToValidator`, so **positions inherit APY automatically** — no separate code path.

`stakedFraction` is derived from `totalActivatedStake` (already summed for `totalProtocolStake`) and `supply.total`, computed once per cache load, not per validator.

## Caching & cost

One combined cache entry, existing ~3-min TTL, shared by `getValidators` and `getDelegations`. Net added cost: **3 RPC calls per 3 minutes** (`getInflationRate` + `getSupply` + `getEpochInfo`) regardless of page count or delegation count.

## Error handling

| Failure | Behavior |
|---|---|
| `getInflationRate` throws | warn, `apy = undefined` → all `apy 0`, `maxApy 0` |
| `getSupply` throws | warn, `apy = undefined` → all `apy 0`, `maxApy 0` |
| `getEpochInfo` throws | warn, `apy = undefined` → all `apy 0`, `maxApy 0` |
| `supply.total = 0` → non-finite `stakedFraction` | `computeStakingApy` returns `0` |
| degenerate `slotsInEpoch` → `epochsPerYear < 1` | clamped to `1` (simple, non-compounded) |
| non-finite / negative result | `computeStakingApy` returns `0` |
| validator is `delinquent` | `apy 0` by status rule |

`getValidators`, `getDelegations`, and `getBalances` never throw solely because APY could not be computed.

## Testing

**`computeStakingApy` (table-driven):**
- real-network case: inflation `0.0373`, staked fraction `0.678`, 0% commission, `epochsPerYear ≈ 182.6` → **≈ 5.65%** (assert within tolerance; this is the live-validated Helius-parity number)
- 0% commission APY > its own uncompounded APR (compounding adds a positive delta)
- 100% commission → `0`
- `stakedFraction = 0` (and non-finite from supply 0) → `0`
- negative inflation → `0`
- commission > 100 clamped → `0`
- `epochsPerYear = 0.5` clamped to `1` → equals the simple (non-compounded) APR

**`createStakingService`:**
- `getValidators` returns non-zero `apy` with mocked inflation/supply/epoch-info, and `maxApy` equals the lowest-commission current validator's APY
- delinquent validator → `apy 0` even with valid inputs
- `getInflationRate` (or `getSupply` / `getEpochInfo`) rejects → all `apy 0`, `maxApy 0`, and a warning is logged (degradation)
- `getDelegations` position inherits the computed `apy` from its resolved validator

**`solana-rpc-client` (light):**
- `getInflationRate` / `getSupply` map Kit responses to the contract shape (string→bigint for supply lamports).

## Docs to update

- `packages/solana/README.md` — replace the "APR / APY in v1" section: describe the issuance-estimate formula (compounded to APY), the MEV/priority-fee exclusion caveat with the live Helius-parity comparison (~5.65% vs 5.63%), the delinquent=0 rule, and that `apy: 0` / `maxApy: 0` also signals "APY unavailable" (degraded) — check logs to disambiguate.
- `.claude/rules/solana.md` — replace the "No APR" section with the issuance-APY summary and the `computeStakingApy` pointer.

## Out of scope / future

- MEV + block/priority-fee APY (Jito integration) — separate project. Live data shows MEV is currently only ~0.10 pp, so this is low priority.
- Realized-reward APY via `getInflationReward` — separate project.
- Vote-credit performance weighting.
