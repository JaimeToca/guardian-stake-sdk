# Solana APR (issuance estimate) — Design

**Date:** 2026-07-24
**Package:** `@guardian-sdk/solana`
**Status:** Approved, pending implementation plan

## Problem

Solana v1 hardcodes `Validator.apy` and `stakingSummary.maxApy` to `0` (see `.claude/rules/solana.md` "No APR"). Consumers can list validators and delegations but have no yield signal to rank or display. This adds a computed, forward-looking **issuance APR** per validator using only plain-RPC data.

## Scope

**In scope:** Issuance (inflation) APR minus validator commission, computed from `getInflationRate`, `getSupply`, and the `getVoteAccounts` data already fetched.

**Explicitly out of scope (v1):** MEV tips and block/priority fees. These require Jito APIs and block-production data that a plain Solana RPC cannot cheaply provide, and would add external HTTP dependencies and per-validator fan-out. Real staking yield is therefore typically **slightly higher** than the number this produces; this must be documented. A future "APY parity" project can layer MEV/block rewards on top.

## Decisions (from brainstorming)

1. **Method:** inflation estimate (not realized `getInflationReward`, not performance-adjusted by vote credits).
2. **Reward scope:** issuance only, commission-adjusted.
3. **Failure behavior:** best-effort — degrade to `apy 0` / `maxApy 0`, never break `getValidators` / `getDelegations` / `getBalances`.
4. **`apy` remains `number`.** Returning `undefined` was considered but rejected: the shared `Validator.apy` type is non-nullable and every chain uses `0` as the "unknown/none" sentinel (BSC has an internal `number | null` but flattens to `?? 0` at the public boundary). Changing the shared type would be a breaking change across all four chains. Instead we keep `0` and **log a warning on degradation** so operators can distinguish "APR unavailable" from "APR genuinely ~0".
5. **Always on:** no config flag. The inputs are two extra RPC calls cached under the existing validators TTL.

## The formula

`getInflationRate` returns an **annual** rate, so no blocks/epochs-per-year math is needed.

```
totalActivatedStake = Σ activatedStake over current + delinquent vote accounts   (lamports)
totalSupply         = getSupply().total                                          (lamports)
stakedFraction      = totalActivatedStake / totalSupply                          (0 < f ≤ 1)
networkApr          = inflationRate.validator / stakedFraction                    (annual fraction)
validatorApr(%)     = networkApr × (1 − commissionPercent / 100) × 100
```

Worked example: validator inflation `0.045`, staked fraction `0.65`, commission `5` →
`0.045 / 0.65 = 0.0692` network → `× 0.95 × 100 = 6.58%` APR.

### Guards (never emit NaN / Infinity / negative)

`computeStakingApr` receives `stakedFraction` (already divided), not raw supply — so a zero/negative supply surfaces here as a non-finite `stakedFraction`.

- `commissionPercent` clamped to `[0, 100]`.
- Return `0` unless `stakedFraction` is a **finite number in `(0, ∞)`** and `inflationValidatorRate ≥ 0`.
- Return `0` if the computed result is non-finite or negative.

The service computes `stakedFraction = Number(totalActivatedStake) / Number(totalSupply)`; when `totalSupply` is `0n` this yields `Infinity`/`NaN`, which the finite-fraction guard maps to `0`.

### Status rules

- **`current`** validators → computed APR.
- **`delinquent`** validators → `apy 0` (not currently producing rewards; an "estimated" positive APR would mislead).
- **`stakingSummary.maxApy`** = APR of the lowest-commission *current* validator
  = `networkApr × (1 − minCommission / 100) × 100`. Delinquent excluded.

## Architecture

### New pure function — `state/apr.ts`

```ts
export interface StakingAprInput {
  inflationValidatorRate: number; // annual fraction, e.g. 0.045
  stakedFraction: number;         // 0 < f ≤ 1
  commissionPercent: number;      // 0..100
}

/** Issuance APR as a percent, clamped to a finite [0, ∞). */
export function computeStakingApr(input: StakingAprInput): number;
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
    apr: { inflationValidatorRate: number; stakedFraction: number } | undefined; // undefined = degraded
  }
  ```
  Fetched together and stored under the existing `VALIDATORS_CACHE_KEY` with the existing `validatorsCacheTtlMs` (~3 min).
- The inflation + supply fetch is wrapped in try/catch. On failure: `logger.warn(...)`, `apr = undefined`.
- `mapVoteToValidator(vote, status, apr)` computes `apy` via `computeStakingApr` when `status === "Active"` and `apr` is defined; otherwise `apy: 0`.
- `stakingSummary.maxApy` computed from `apr` + min commission across current validators; `0` when `apr` is undefined or there are no current validators.
- `getDelegations` already resolves validators through `validatorMap`/`mapVoteToValidator`, so **positions inherit APR automatically** — no separate code path.

`stakedFraction` is derived from `totalActivatedStake` (already summed for `totalProtocolStake`) and `supply.total`, computed once per cache load, not per validator.

## Caching & cost

One combined cache entry, existing ~3-min TTL, shared by `getValidators` and `getDelegations`. Net added cost: **2 RPC calls per 3 minutes** regardless of page count or delegation count.

## Error handling

| Failure | Behavior |
|---|---|
| `getInflationRate` throws | warn, `apr = undefined` → all `apy 0`, `maxApy 0` |
| `getSupply` throws | warn, `apr = undefined` → all `apy 0`, `maxApy 0` |
| `supply.total = 0` → non-finite `stakedFraction` | `computeStakingApr` returns `0` |
| non-finite / negative result | `computeStakingApr` returns `0` |
| validator is `delinquent` | `apy 0` by status rule |

`getValidators`, `getDelegations`, and `getBalances` never throw solely because APR could not be computed.

## Testing

**`computeStakingApr` (table-driven):**
- normal case (assert the 6.58% worked example within tolerance)
- 0% commission (APR = network APR)
- 100% commission (APR = 0)
- `stakedFraction = 0` → 0
- negative inflation → 0
- non-finite (e.g. supply 0 path feeding Infinity) → 0
- commission > 100 clamped → 0

**`createStakingService`:**
- `getValidators` returns non-zero `apy` with mocked inflation/supply, and `maxApy` equals the lowest-commission current validator's APR
- delinquent validator → `apy 0` even with valid inputs
- `getInflationRate` rejects → all `apy 0`, `maxApy 0`, and a warning is logged (degradation)
- `getDelegations` position inherits the computed `apy` from its resolved validator

**`solana-rpc-client` (light):**
- `getInflationRate` / `getSupply` map Kit responses to the contract shape (string→bigint for supply lamports).

## Docs to update

- `packages/solana/README.md` — replace the "APR / APY in v1" section: describe the issuance-estimate formula, the MEV/priority-fee exclusion caveat, the delinquent=0 rule, and that `apy: 0` / `maxApy: 0` also signals "APR unavailable" (degraded) — check logs to disambiguate.
- `.claude/rules/solana.md` — replace the "No APR" section with the issuance-APR summary and the `computeStakingApr` pointer.

## Out of scope / future

- MEV + block/priority-fee APY (Jito integration) — separate project.
- Realized-reward APR via `getInflationReward` — separate project.
- Vote-credit performance weighting.
