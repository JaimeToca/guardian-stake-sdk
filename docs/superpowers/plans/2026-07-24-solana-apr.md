# Solana Staking APY (issuance estimate) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded `apy: 0` on Solana validators/delegations with a computed, per-epoch-compounded **issuance APY** derived from inflation, supply, and stake data.

**Architecture:** A pure `computeStakingApy(input)` function does the math (mirrors Tron's `computeApr`). Two new thin RPC methods (`getInflationRate`, `getSupply`) feed it, alongside the already-present `getEpochInfo` and `getVoteAccounts`. `createStakingService` fetches these best-effort into one combined cache entry (existing validators TTL) and applies the APY per validator; `getDelegations` inherits it for free. Any fetch/math failure degrades to `apy 0` and logs a warning — the validator list never breaks.

**Tech Stack:** TypeScript (strict), `@solana/kit` RPC, vitest, factory functions (no classes).

## Global Constraints

- **No classes** — factory functions only (`createXxxService`); never the `class` keyword.
- **No `any`** — use `unknown` and narrow, or a proper type.
- **Logger injection** — never bare `console.log`; use the injected `Logger` (`logger.debug/info/warn/error`).
- **No Kit types leak into `packages/sdk`** — the shared `Validator.apy` stays `number`; APY unavailable is represented as `0` (never `undefined`/`null`).
- **`@guardian-sdk/sdk` must be built before `@guardian-sdk/solana`** — run `pnpm --filter @guardian-sdk/sdk run build` before running Solana tests in a fresh checkout.
- **APY is issuance-only** — excludes MEV and priority/block fees (documented caveat). Never emit `NaN`/`Infinity`/negative — clamp to a finite `[0, ∞)`.
- `SLOTS_PER_YEAR = 78_894_000` (Solana protocol constant: 2.5 ideal slots/sec × seconds/year).

---

## File Structure

- `packages/solana/src/solana-chain/state/constants.ts` — **modify**: add `SLOTS_PER_YEAR`.
- `packages/solana/src/solana-chain/state/apr.ts` — **create**: `StakingApyInput`, `computeStakingApy`.
- `packages/solana/tests/state/apr.test.ts` — **create**: table-driven tests for `computeStakingApy`.
- `packages/solana/src/solana-chain/rpc/solana-rpc-types.ts` — **modify**: add `InflationRate`, `Supply`.
- `packages/solana/src/solana-chain/rpc/solana-rpc-client-contract.ts` — **modify**: add `getInflationRate`, `getSupply`.
- `packages/solana/src/solana-chain/rpc/solana-rpc-client.ts` — **modify**: implement both methods.
- `packages/solana/tests/services/{staking,balance,fee,sign}-service.test.ts` + `packages/solana/tests/tx/tx-builder.test.ts` — **modify**: add the two methods to each `mockRpc`.
- `packages/solana/src/solana-chain/services/staking-service.ts` — **modify**: combined-inputs cache, per-validator APY, `maxApy`.
- `packages/solana/tests/services/staking-service.test.ts` — **modify**: APY behavior tests.
- `packages/solana/README.md` + `.claude/rules/solana.md` — **modify**: replace the "no APR" copy.

---

## Task 1: RPC methods `getInflationRate` + `getSupply`

**Files:**
- Modify: `packages/solana/src/solana-chain/rpc/solana-rpc-types.ts`
- Modify: `packages/solana/src/solana-chain/rpc/solana-rpc-client-contract.ts`
- Modify: `packages/solana/src/solana-chain/rpc/solana-rpc-client.ts`
- Modify: `packages/solana/tests/services/staking-service.test.ts`
- Modify: `packages/solana/tests/services/balance-service.test.ts`
- Modify: `packages/solana/tests/services/fee-service.test.ts`
- Modify: `packages/solana/tests/services/sign-service.test.ts`
- Modify: `packages/solana/tests/tx/tx-builder.test.ts`

**Interfaces:**
- Produces: `interface InflationRate { total: number; validator: number; foundation: number; epoch: bigint }`, `interface Supply { total: bigint; circulating: bigint }`, and contract methods `getInflationRate(): Promise<InflationRate>`, `getSupply(): Promise<Supply>`.

**Note:** Adding two required methods to `SolanaRpcClientContract` breaks every existing `mockRpc` (TS "missing properties") — this task adds `vi.fn()` stubs to all five mocks so the suite still compiles. The RPC client is a thin Kit pass-through; consistent with the repo (no existing `rpc-client.test.ts`), it has no dedicated unit test — its verification gate is `typecheck` + the full Solana suite staying green.

- [ ] **Step 1: Add result types**

In `solana-rpc-types.ts`, append:

```ts
/** Current-epoch inflation split (annual fractions) from `getInflationRate`. */
export interface InflationRate {
  total: number;
  validator: number;
  foundation: number;
  epoch: bigint;
}

/** Circulating / total supply in lamports from `getSupply`. */
export interface Supply {
  total: bigint;
  circulating: bigint;
}
```

- [ ] **Step 2: Extend the contract**

In `solana-rpc-client-contract.ts`, add `InflationRate` and `Supply` to the import from `./solana-rpc-types`, then add inside `SolanaRpcClientContract`:

```ts
  /** Current-epoch inflation rates (annual fractions). */
  getInflationRate(): Promise<InflationRate>;
  /** Circulating / total supply in lamports (non-circulating account list excluded). */
  getSupply(): Promise<Supply>;
```

- [ ] **Step 3: Implement in the client**

In `solana-rpc-client.ts`, add `InflationRate`, `Supply` to the type import, then add these two methods to the returned object (next to `getEpochInfo`):

```ts
    getInflationRate() {
      return rpcCall("getInflationRate", logger, async () => {
        const r = await rpc.getInflationRate().send();
        return {
          total: r.total,
          validator: r.validator,
          foundation: r.foundation,
          epoch: r.epoch,
        };
      });
    },

    getSupply() {
      return rpcCall("getSupply", logger, async () => {
        const { value } = await rpc.getSupply({ excludeNonCirculatingAccountsList: true }).send();
        return { total: value.total, circulating: value.circulating };
      });
    },
```

- [ ] **Step 4: Add stubs to all five `mockRpc` helpers**

In each of `tests/services/staking-service.test.ts`, `tests/services/balance-service.test.ts`, `tests/services/fee-service.test.ts`, `tests/services/sign-service.test.ts`, and `tests/tx/tx-builder.test.ts`, find the `mockRpc(...)` object literal and add these two lines alongside the other `vi.fn()` entries (e.g. right after `getStakeMinimumDelegation: ...`):

```ts
    getInflationRate: vi.fn(),
    getSupply: vi.fn(),
```

- [ ] **Step 5: Verify compile + suite green**

Run: `pnpm --filter @guardian-sdk/sdk run build && pnpm --filter @guardian-sdk/solana run typecheck && pnpm --filter @guardian-sdk/solana run test`
Expected: typecheck passes; all existing tests PASS (105 currently). The unconfigured `vi.fn()` stubs return `undefined`, which is fine — nothing calls them yet.

- [ ] **Step 6: Commit**

```bash
git add packages/solana/src/solana-chain/rpc packages/solana/tests
git commit -m "feat(solana): add getInflationRate/getSupply RPC methods"
```

---

## Task 2: `computeStakingApy` pure function

**Files:**
- Modify: `packages/solana/src/solana-chain/state/constants.ts`
- Create: `packages/solana/src/solana-chain/state/apr.ts`
- Create: `packages/solana/tests/state/apr.test.ts`

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  ```ts
  export interface StakingApyInput {
    inflationValidatorRate: number; // annual fraction, e.g. 0.0373
    stakedFraction: number;         // 0 < f ≤ 1
    commissionPercent: number;      // 0..100
    epochsPerYear: number;          // ~182 (clamped ≥ 1)
  }
  export function computeStakingApy(input: StakingApyInput): number; // APY percent, finite [0, ∞)
  ```
  Also `export const SLOTS_PER_YEAR = 78_894_000;` from `state/constants.ts`.

- [ ] **Step 1: Add the constant**

In `state/constants.ts`, append:

```ts
/**
 * Solana protocol slots-per-year (2.5 ideal slots/sec × seconds/year) — the basis
 * the runtime uses to annualize per-epoch rewards. `epochsPerYear = SLOTS_PER_YEAR / slotsInEpoch`.
 */
export const SLOTS_PER_YEAR = 78_894_000;
```

- [ ] **Step 2: Write the failing test**

Create `packages/solana/tests/state/apr.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeStakingApy } from "../../src/solana-chain/state/apr";

// Live-validated basis (epoch 1006): inflation 0.0373, staked fraction 0.678, ~182.6 epochs/yr.
const EPOCHS_PER_YEAR = 78_894_000 / 432_000; // ≈ 182.625

describe("computeStakingApy", () => {
  it("matches the live network case (~5.65% APY at 0% commission)", () => {
    const apy = computeStakingApy({
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: EPOCHS_PER_YEAR,
    });
    expect(apy).toBeCloseTo(5.65, 1); // within 0.05
  });

  it("compounded APY exceeds the simple APR", () => {
    const input = {
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: EPOCHS_PER_YEAR,
    };
    const apy = computeStakingApy(input);
    const simpleAprPercent = (0.0373 / 0.678) * 100; // ≈ 5.50
    expect(apy).toBeGreaterThan(simpleAprPercent);
  });

  it("returns 0 at 100% commission", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: 0.0373,
        stakedFraction: 0.678,
        commissionPercent: 100,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("clamps commission > 100 to 100 → 0", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: 0.0373,
        stakedFraction: 0.678,
        commissionPercent: 150,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("returns 0 for a non-positive or non-finite staked fraction", () => {
    const base = { inflationValidatorRate: 0.0373, commissionPercent: 0, epochsPerYear: EPOCHS_PER_YEAR };
    expect(computeStakingApy({ ...base, stakedFraction: 0 })).toBe(0);
    expect(computeStakingApy({ ...base, stakedFraction: Infinity })).toBe(0);
    expect(computeStakingApy({ ...base, stakedFraction: Number.NaN })).toBe(0);
  });

  it("returns 0 for negative inflation", () => {
    expect(
      computeStakingApy({
        inflationValidatorRate: -0.01,
        stakedFraction: 0.678,
        commissionPercent: 0,
        epochsPerYear: EPOCHS_PER_YEAR,
      })
    ).toBe(0);
  });

  it("clamps epochsPerYear < 1 to 1 (simple, non-compounded)", () => {
    const apy = computeStakingApy({
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678,
      commissionPercent: 0,
      epochsPerYear: 0.5,
    });
    const simpleAprPercent = (0.0373 / 0.678) * 100; // epochsPerYear=1 → apy == apr
    expect(apy).toBeCloseTo(simpleAprPercent, 6);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @guardian-sdk/solana exec vitest run tests/state/apr.test.ts`
Expected: FAIL — cannot resolve `../../src/solana-chain/state/apr` (module not created yet).

- [ ] **Step 4: Write the implementation**

Create `packages/solana/src/solana-chain/state/apr.ts`:

```ts
/** Inputs for the issuance-APY estimate. All fractions are annual. */
export interface StakingApyInput {
  /** Validator inflation rate (annual fraction), e.g. 0.0373. */
  inflationValidatorRate: number;
  /** Fraction of total supply staked, 0 < f ≤ 1. */
  stakedFraction: number;
  /** Validator commission percent, 0..100. */
  commissionPercent: number;
  /** Compounding periods per year (~182); clamped to ≥ 1. */
  epochsPerYear: number;
}

/**
 * Issuance staking APY as a percent, per-epoch compounded and commission-adjusted.
 *
 * `networkApr = inflation / stakedFraction`;
 * `apr = networkApr × (1 − commission)`;
 * `apy = ((1 + apr / epochsPerYear) ^ epochsPerYear − 1) × 100`.
 *
 * Excludes MEV and priority/block fees. Always finite and ≥ 0 — invalid inputs return 0.
 */
export function computeStakingApy(input: StakingApyInput): number {
  const { inflationValidatorRate, stakedFraction } = input;

  if (!Number.isFinite(stakedFraction) || stakedFraction <= 0) return 0;
  if (!Number.isFinite(inflationValidatorRate) || inflationValidatorRate < 0) return 0;

  const commissionPercent = Math.min(100, Math.max(0, input.commissionPercent));
  const epochsPerYear = Number.isFinite(input.epochsPerYear)
    ? Math.max(1, input.epochsPerYear)
    : 1;

  const networkApr = inflationValidatorRate / stakedFraction;
  const apr = networkApr * (1 - commissionPercent / 100);
  const apy = (Math.pow(1 + apr / epochsPerYear, epochsPerYear) - 1) * 100;

  if (!Number.isFinite(apy) || apy < 0) return 0;
  return apy;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @guardian-sdk/solana exec vitest run tests/state/apr.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/solana/src/solana-chain/state/constants.ts packages/solana/src/solana-chain/state/apr.ts packages/solana/tests/state/apr.test.ts
git commit -m "feat(solana): computeStakingApy pure function (issuance APY)"
```

---

## Task 3: Wire APY into `createStakingService`

**Files:**
- Modify: `packages/solana/src/solana-chain/services/staking-service.ts`
- Modify: `packages/solana/tests/services/staking-service.test.ts`

**Interfaces:**
- Consumes: `computeStakingApy` (Task 2), `SLOTS_PER_YEAR` (Task 2), `rpc.getInflationRate()` / `rpc.getSupply()` (Task 1), existing `rpc.getEpochInfo()` / `rpc.getVoteAccounts()`.
- Produces: internal `ValidatorInputs { voteAccounts; apy: ApyInputs | undefined }` where `ApyInputs { inflationValidatorRate: number; stakedFraction: number; epochsPerYear: number }`. Public behavior unchanged in shape; `Validator.apy` / `stakingSummary.maxApy` now non-zero when inputs are available.

- [ ] **Step 1: Write the failing tests**

**Do NOT change the default `mockRpc`.** Its `getInflationRate`/`getSupply` stay the bare `vi.fn()` stubs from Task 1 (they resolve `undefined`, so `loadApyInputs` throws → degrades → `apy 0`). This is deliberate: the two pre-existing assertions — line ~205 `expect(page.data[0]!.apy).toBe(0)` and line ~258 `expect(stakingSummary.maxApy).toBe(0)` — keep passing unchanged, now exercising the degradation path. The new tests below supply healthy overrides to exercise the computed path.

First, give the existing `voteInfo` helper an optional commission (existing callers keep the default `5`). Change its signature:

```ts
function voteInfo(votePubkey: string, activatedStake: bigint, commission = 5) {
  return {
    votePubkey,
    nodePubkey: votePubkey,
    activatedStake,
    commission,
    epochVoteAccount: true,
    lastVote: 1n,
    rootSlot: 1n,
    epochCredits: [] as const,
  };
}
```

Add these imports at the top of the file if missing (`createStakePositionCache` is already imported):

```ts
import { computeStakingApy } from "../../src/solana-chain/state/apr";
```

Then add this `describe` block. The default `mockRpc` already returns `getEpochInfo` with `slotsInEpoch: 432_000n` (→ `epochsPerYear = 78_894_000 / 432_000 ≈ 182.625`); we override only `getVoteAccounts`, `getInflationRate`, and `getSupply` for healthy APY inputs. `stakedFraction = Σ activatedStake / supply.total`.

```ts
describe("createStakingService — APY", () => {
  const EPY = 78_894_000 / 432_000; // ≈ 182.625

  // Healthy APY inputs: inflation 0.0373, supply.total 1000 → stakedFraction = Σstake/1000.
  function apyRpc(
    current: ReturnType<typeof voteInfo>[],
    delinquent: ReturnType<typeof voteInfo>[] = []
  ): SolanaRpcClientContract {
    return mockRpc({
      getVoteAccounts: vi.fn().mockResolvedValue({ current, delinquent }),
      getInflationRate: vi
        .fn()
        .mockResolvedValue({ total: 0.0373, validator: 0.0373, foundation: 0, epoch: 1006n }),
      getSupply: vi.fn().mockResolvedValue({ total: 1000n, circulating: 900n }),
    });
  }

  it("getValidators returns compounded issuance APY (~5.65% at 0% commission)", async () => {
    const rpc = apyRpc([voteInfo(VOTE_A, 678n, 0)]);
    const svc = createStakingService(rpc, createStakePositionCache());
    const page = await svc.getValidators();
    expect(page.data[0]!.apy).toBeCloseTo(5.65, 1); // stakedFraction 0.678
  });

  it("delinquent validators report apy 0 even with valid inputs", async () => {
    const rpc = apyRpc([voteInfo(VOTE_A, 678n, 0)], [voteInfo(VOTE_B, 10n, 0)]);
    const svc = createStakingService(rpc, createStakePositionCache());
    const page = await svc.getValidators({ pageSize: 50 });
    const delinquent = page.data.find((v) => v.id === VOTE_B)!;
    expect(delinquent.status).toBe("Inactive");
    expect(delinquent.apy).toBe(0);
  });

  it("maxApy uses the lowest-commission current validator", async () => {
    const rpc = apyRpc([voteInfo(VOTE_A, 400n, 10), voteInfo(VOTE_B, 278n, 5)]);
    const svc = createStakingService(rpc, createStakePositionCache());
    const { stakingSummary } = await svc.getDelegations(AUTHORITY);
    const expected = computeStakingApy({
      inflationValidatorRate: 0.0373,
      stakedFraction: 0.678, // (400 + 278) / 1000
      commissionPercent: 5,
      epochsPerYear: EPY,
    });
    expect(stakingSummary.maxApy).toBeCloseTo(expected, 6);
    expect(stakingSummary.maxApy).toBeGreaterThan(0);
  });

  it("degrades to apy 0 and warns when inflation inputs fail", async () => {
    const warn = vi.fn();
    const logger = { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn() };
    const rpc = mockRpc({
      getVoteAccounts: vi.fn().mockResolvedValue({ current: [voteInfo(VOTE_A, 678n, 0)], delinquent: [] }),
      getInflationRate: vi.fn().mockRejectedValue(new Error("rpc down")),
      getSupply: vi.fn().mockResolvedValue({ total: 1000n, circulating: 900n }),
    });
    const svc = createStakingService(rpc, createStakePositionCache(), {}, logger);
    const page = await svc.getValidators();
    expect(page.data[0]!.apy).toBe(0);
    expect(warn).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @guardian-sdk/solana exec vitest run tests/services/staking-service.test.ts -t "APY"`
Expected: FAIL — `apy` is currently hardcoded `0`, so the ~5.65% and `maxApy` assertions fail.

- [ ] **Step 3: Add the constant + fn imports to the service**

In `staking-service.ts`, add near the existing imports:

```ts
import { computeStakingApy } from "../state/apr";
import { SLOTS_PER_YEAR } from "../state/constants";
```

- [ ] **Step 4: Add the input types**

In `staking-service.ts`, add above `createStakingService`:

```ts
/** Network-wide inputs for the issuance-APY estimate (per cache load). */
interface ApyInputs {
  inflationValidatorRate: number;
  stakedFraction: number;
  epochsPerYear: number;
}

/** Combined validators + APY inputs cached under one key. `apy` is undefined when degraded. */
interface ValidatorInputs {
  voteAccounts: VoteAccountsResult;
  apy: ApyInputs | undefined;
}
```

- [ ] **Step 5: Replace `mapVoteToValidator` and `validatorMap` to thread APY**

Replace the existing `mapVoteToValidator` function with:

```ts
function computeValidatorApy(
  vote: VoteAccountInfo,
  status: "Active" | "Inactive",
  apy: ApyInputs | undefined
): number {
  if (status !== "Active" || !apy) return 0;
  return computeStakingApy({
    inflationValidatorRate: apy.inflationValidatorRate,
    stakedFraction: apy.stakedFraction,
    epochsPerYear: apy.epochsPerYear,
    commissionPercent: vote.commission,
  });
}

function mapVoteToValidator(
  vote: VoteAccountInfo,
  status: "Active" | "Inactive",
  apy: ApyInputs | undefined
): Validator {
  return buildValidator({
    id: vote.votePubkey,
    status,
    name: vote.votePubkey,
    operatorAddress: vote.votePubkey,
    apy: computeValidatorApy(vote, status, apy),
  });
}
```

- [ ] **Step 6: Replace `loadVoteAccounts` with `loadValidatorInputs` (+ `validatorMap`, `computeMaxApy`)**

Inside `createStakingService`, replace the `loadVoteAccounts` function and the `validatorMap` function with:

```ts
  async function loadValidatorInputs(): Promise<ValidatorInputs> {
    const cached = voteCache.get(VALIDATORS_CACHE_KEY);
    if (cached) {
      logger.debug("StakingService: validator inputs cache hit", {
        current: cached.voteAccounts.current.length,
        delinquent: cached.voteAccounts.delinquent.length,
        apy: cached.apy !== undefined,
      });
      return cached;
    }
    logger.debug("StakingService: validator inputs cache miss — fetching");
    const voteAccounts = await rpc.getVoteAccounts();
    const apy = await loadApyInputs(voteAccounts);
    const result: ValidatorInputs = { voteAccounts, apy };
    voteCache.set(VALIDATORS_CACHE_KEY, result, validatorsTtl);
    return result;
  }

  async function loadApyInputs(
    voteAccounts: VoteAccountsResult
  ): Promise<ApyInputs | undefined> {
    try {
      const [inflation, supply, epochInfo] = await Promise.all([
        rpc.getInflationRate(),
        rpc.getSupply(),
        rpc.getEpochInfo(),
      ]);
      const totalActivatedStake = [...voteAccounts.current, ...voteAccounts.delinquent].reduce(
        (sum, v) => sum + v.activatedStake,
        0n
      );
      const stakedFraction = Number(totalActivatedStake) / Number(supply.total);
      const epochsPerYear =
        epochInfo.slotsInEpoch > 0n ? SLOTS_PER_YEAR / Number(epochInfo.slotsInEpoch) : 1;
      return {
        inflationValidatorRate: inflation.validator,
        stakedFraction,
        epochsPerYear,
      };
    } catch (err) {
      logger.warn("StakingService: APY inputs unavailable — reporting apy 0", {
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  function validatorMap(inputs: ValidatorInputs): Map<string, Validator> {
    const map = new Map<string, Validator>();
    for (const v of inputs.voteAccounts.current) {
      map.set(v.votePubkey, mapVoteToValidator(v, "Active", inputs.apy));
    }
    for (const v of inputs.voteAccounts.delinquent) {
      if (!map.has(v.votePubkey)) {
        map.set(v.votePubkey, mapVoteToValidator(v, "Inactive", inputs.apy));
      }
    }
    return map;
  }

  function computeMaxApy(
    current: VoteAccountInfo[],
    apy: ApyInputs | undefined
  ): number {
    if (!apy || current.length === 0) return 0;
    const minCommission = current.reduce((min, v) => (v.commission < min ? v.commission : min), 100);
    return computeStakingApy({
      inflationValidatorRate: apy.inflationValidatorRate,
      stakedFraction: apy.stakedFraction,
      epochsPerYear: apy.epochsPerYear,
      commissionPercent: minCommission,
    });
  }
```

Also change the cache declaration from `createInMemoryCache<string, VoteAccountsResult>(validatorsTtl)` to:

```ts
  const voteCache = createInMemoryCache<string, ValidatorInputs>(validatorsTtl);
```

- [ ] **Step 7: Update `getValidators` and `getDelegations` bodies**

In `getValidators`, replace the `const votes = await loadVoteAccounts();` line and the `all` construction with:

```ts
      const inputs = await loadValidatorInputs();
      const votes = inputs.voteAccounts;
      const all: Validator[] = [
        ...votes.current.map((v) => mapVoteToValidator(v, "Active", inputs.apy)),
        ...votes.delinquent.map((v) => mapVoteToValidator(v, "Inactive", inputs.apy)),
      ];
```

In `getDelegations`, replace the `Promise.all` destructuring and the `byVote` / `maxApy` lines. The `Promise.all` becomes:

```ts
      const [positions, inputs, minDelegation, epochInfo] = await Promise.all([
        loadPositions({ rpc, cache, config, logger }, address),
        loadValidatorInputs(),
        rpc.getStakeMinimumDelegation(),
        rpc.getEpochInfo(),
      ]);
      const votes = inputs.voteAccounts;
      const byVote = validatorMap(inputs);
```

and in the returned `stakingSummary`, change `maxApy: 0,` to:

```ts
          maxApy: computeMaxApy(votes.current, inputs.apy),
```

(The rest of `getDelegations` — `totalProtocolStake`, `estimateEpochBoundaryMs`, delegation loop — is unchanged and still references `votes`.)

- [ ] **Step 8: Run the APY tests to verify they pass**

Run: `pnpm --filter @guardian-sdk/solana exec vitest run tests/services/staking-service.test.ts`
Expected: PASS — the new APY tests plus all pre-existing staking-service tests.

- [ ] **Step 9: Run the full Solana suite + typecheck**

Run: `pnpm --filter @guardian-sdk/solana run typecheck && pnpm --filter @guardian-sdk/solana run test`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/solana/src/solana-chain/services/staking-service.ts packages/solana/tests/services/staking-service.test.ts
git commit -m "feat(solana): compute issuance APY per validator and maxApy"
```

---

## Task 4: Documentation

**Files:**
- Modify: `packages/solana/README.md` (the "APR / APY in v1" section, ~line 219)
- Modify: `.claude/rules/solana.md` (the "No APR" section)

**Interfaces:** none (docs only).

- [ ] **Step 1: Update the README APR section**

In `packages/solana/README.md`, replace the "APR / APY in v1" section body with:

```markdown
### APR / APY

`Validator.apy` and `stakingSummary.maxApy` carry a computed **issuance APY** (percent):

- `networkApr = inflationRate.validator / stakedFraction` (both annual, from `getInflationRate` + `getSupply` + summed `activatedStake`)
- per validator: `× (1 − commission)`, then **compounded per epoch** to an APY (`epochsPerYear = 78_894_000 / slotsInEpoch`).
- `stakingSummary.maxApy` = the lowest-commission current validator's APY.

**Issuance only** — excludes MEV and priority/block fees. Live check (epoch 1006): ours ~**5.65%** vs Helius's own validator `total_apy` **5.63%** (MEV was ~0.10pp). Delegator-facing yield is therefore very close; real yield runs marginally higher.

**`apy: 0` is also the "unavailable" sentinel.** Delinquent validators are always `0` (not producing). If the inflation/supply/epoch fetch fails, the service logs a warning and reports `apy 0` / `maxApy 0` rather than breaking `getValidators` / `getDelegations`. Check logs to distinguish "unavailable" from a genuine ~0% (100%-commission) validator.

Inputs are fetched best-effort and cached with the validators list (~3 min TTL): 3 extra RPC calls per refresh, shared by `getValidators` and `getDelegations`.
```

- [ ] **Step 2: Update `.claude/rules/solana.md`**

In `.claude/rules/solana.md`, replace the `## No APR` section with:

```markdown
## APR / APY — issuance estimate

`Validator.apy` and `stakingSummary.maxApy` are a computed **issuance APY** (percent), not `0`. The pure `computeStakingApy(input)` in `state/apr.ts` does the math: `inflation.validator / stakedFraction × (1 − commission)`, compounded per epoch (`epochsPerYear = SLOTS_PER_YEAR / slotsInEpoch`). Inputs come from `getInflationRate` + `getSupply` + `getEpochInfo` + summed `activatedStake`, fetched best-effort into the validators cache.

**Issuance only** — MEV and priority/block fees are out of scope (documented). On any input-fetch failure the service logs a warning and degrades to `apy 0` / `maxApy 0`; delinquent validators are always `0`. Do not change the shared `Validator.apy` type away from `number` — `0` is the "unavailable/none" sentinel across all chains.
```

- [ ] **Step 3: Verify docs formatting**

Run: `pnpm run format:check`
Expected: "All matched files use Prettier code style!" (README/rules are markdown; if Prettier is configured to skip them this still passes — the check must not error).

- [ ] **Step 4: Commit**

```bash
git add packages/solana/README.md .claude/rules/solana.md
git commit -m "docs(solana): document computed issuance APY"
```

---

## Final verification

- [ ] Run the whole monorepo suite and typecheck:

Run: `pnpm run typecheck && pnpm run test`
Expected: all packages typecheck clean; all tests PASS (Solana gains the `apr` suite + 4 APY service tests).

- [ ] Run lint + format:

Run: `pnpm run lint && pnpm run format:check`
Expected: no lint errors; formatting clean.
