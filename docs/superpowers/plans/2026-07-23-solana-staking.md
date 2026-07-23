# Solana Native Staking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `@guardian-sdk/solana` implementing `GuardianServiceContract` for Solana native staking (seed-derived stake accounts: create+delegate, deactivate, withdraw), mirroring Tron/BSC/Cardano packages.

**Architecture:** A `solana({ rpcUrl, ... })` factory wires `createSolanaRpc` (via `@solana/kit`) + Codama program clients (`@solana-program/system`, `@solana-program/stake`) + `@solana/sysvars` into services (staking, balance, fee, sign, broadcast) and returns a plain `GuardianServiceContract`. Stake positions are discovered by seed-scan with a shared short TTL cache. Signing is single-key Ed25519 over compiled message bytes.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, tsup, `@solana/kit@7`, `@solana/sysvars@7`, `@solana-program/stake@0.8`, `@solana-program/system@^0.13`, `@guardian-sdk/sdk` (peer).

**Design spec:** `docs/superpowers/specs/2026-07-23-solana-staking-design.md`

## Global Constraints

- Node ≥ 22; TypeScript strict; **no classes** (factory functions only); **no `any`** (`unknown` + narrow).
- Units: **lamports**, `1 SOL = 1_000_000_000` lamports, `decimals: 9`.
- Deps: Kit stack only — **no `@solana/web3.js`**. `packages/sdk` must not import any `@solana/*`.
- Build order: `packages/sdk` → `packages/solana` (alongside bsc/cardano/tron).
- Logger injected via config; never bare `console.log`.
- Errors: `ValidationError` / `ConfigError` / `SigningError` / `UnsupportedError` (or existing codes) from `@guardian-sdk/sdk`.
- Factory pattern only; return plain `GuardianServiceContract` object.
- APR out of scope: `Validator.apy` always `0`.
- After exported-type changes in `packages/sdk`, update package READMEs that document fee/chain unions.
- Prefer large coherent commits matching task boundaries; verify with `pnpm --filter @guardian-sdk/solana test`, package typecheck, and root build at milestones.

## File map (create unless noted)

```
packages/sdk/src/chain/chain-types.ts          # MODIFY: +Solana
packages/sdk/src/entity/fee-types.ts           # MODIFY: +SolanaFee
packages/sdk/src/index.ts                      # ensure Fee re-export path still works

packages/solana/
  package.json
  tsconfig.json, tsconfig.test.json, tsup.config.ts, vitest.config.ts, README.md
  src/
    index.ts
    chain/index.ts
    solana-chain/
      index.ts                                 # solana() factory
      rpc/
        solana-rpc-client-contract.ts
        solana-rpc-client.ts
        solana-rpc-types.ts
        index.ts
      state/
        constants.ts                           # program ids, space=200, seed helpers
        seed.ts
        activation.ts
        stake-account.ts
        stake-cache.ts
      tx/
        solana-types.ts
        validations.ts
        tx-builder.ts
      services/
        staking-service.ts
        balance-service.ts
        fee-service.ts
        sign-service.ts
        broadcast-service.ts
  tests/
    state/activation.test.ts
    state/seed.test.ts
    services/staking-service.test.ts
    services/balance-service.test.ts
    services/fee-service.test.ts
    services/sign-service.test.ts
    tx/tx-builder.test.ts
    validations.test.ts
    fixtures/                                  # realistic base64 / jsonParsed stake + vote fixtures

examples/solana-native-staking-sample.ts
.claude/rules/solana.md
docs/adding-a-chain.md / CLAUDE.md / root package.json / eslint.config.mjs  # MODIFY wire-up
```

---

### Task 1: Shared SDK — `Solana` chain type + `SolanaFee`

**Files:**
- Modify: `packages/sdk/src/chain/chain-types.ts`
- Modify: `packages/sdk/src/entity/fee-types.ts`
- Modify: `packages/sdk/README.md` (fee / chain docs if present)
- Test: `packages/sdk/tests/entity/solana-fee-types.test.ts` (type-level smoke via runtime discriminant)

**Interfaces:**
- Produces:
  - `GuardianChainType = "Smartchain" | "Cardano" | "Tron" | "Solana"`
  - `ChainEcosystemType = "Ethereum" | "Cardano" | "Tron" | "Solana"`
  - `SolanaFee { type: "SolanaFee"; computeUnits: bigint; computeUnitPrice: bigint; total: bigint }`
  - `FeeType` includes `"SolanaFee"`; `Fee` union includes `SolanaFee`

- [ ] **Step 1: Write a small runtime test**

```ts
// packages/sdk/tests/entity/solana-fee-types.test.ts
import { describe, it, expect } from "vitest";
import type { Fee, SolanaFee } from "../../src";

describe("SolanaFee", () => {
  it("is a Fee discriminant", () => {
    const fee: SolanaFee = {
      type: "SolanaFee",
      computeUnits: 200_000n,
      computeUnitPrice: 1n,
      total: 5000n,
    };
    const asFee: Fee = fee;
    expect(asFee.type).toBe("SolanaFee");
  });
});
```

- [ ] **Step 2: Implement type changes**

`chain-types.ts`:
```ts
export type GuardianChainType = "Smartchain" | "Cardano" | "Tron" | "Solana";
export type ChainEcosystemType = "Ethereum" | "Cardano" | "Tron" | "Solana";
```

`fee-types.ts` — append:
```ts
/** Solana fee model: base signature fee + optional priority (CU × microlamports/CU). `total` in lamports. */
export interface SolanaFee {
  type: "SolanaFee";
  computeUnits: bigint;
  computeUnitPrice: bigint;
  total: bigint;
}

export type FeeType = "GasFee" | "UtxoFee" | "ResourceFee" | "SolanaFee";
export type Fee = GasFee | UtxoFee | ResourceFee | SolanaFee;
```

Ensure `packages/sdk/src/entity/types.ts` (if it re-exports fees) still covers the new type.

- [ ] **Step 3: Verify**

```bash
pnpm --filter @guardian-sdk/sdk test -- solana-fee
pnpm --filter @guardian-sdk/sdk run typecheck
pnpm --filter @guardian-sdk/sdk run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk
git commit -m "feat(sdk): add Solana chain type and SolanaFee"
```

---

### Task 2: Scaffold `@guardian-sdk/solana` package + monorepo wire-up

**Files:**
- Create: full `packages/solana/**` skeleton (can start from `python3 scripts/scaffold_chain.py solana --symbol SOL --explorer https://explorer.solana.com --no-viem` then reshape to `solana-chain/` like Tron)
- Modify: root `package.json` scripts (`build`, `test` filters)
- Modify: `eslint.config.mjs` (add solana tsconfigs)
- Modify: `examples/tsconfig.json` paths
- Modify: `Claude.md` / `CLAUDE.md` package list + Kit deps note
- Create: `packages/solana/package.json` with exact deps below

**Interfaces:**
- Produces: buildable empty package exporting `solana`, `chains`, types stubs
- Consumes: `@guardian-sdk/sdk` workspace peer

- [ ] **Step 1: package.json**

```json
{
  "name": "@guardian-sdk/solana",
  "version": "0.0.0",
  "description": "Guardian SDK for Solana native staking",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.js"
    }
  },
  "sideEffects": false,
  "files": ["dist"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsup",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "@guardian-sdk/sdk": "workspace:^"
  },
  "dependencies": {
    "@solana/kit": "7.0.0",
    "@solana/sysvars": "7.0.0",
    "@solana-program/stake": "0.8.0",
    "@solana-program/system": "0.13.0"
  },
  "devDependencies": {
    "@guardian-sdk/sdk": "workspace:^",
    "tsup": "^8.5.1",
    "vitest": "^4.1.3"
  },
  "engines": { "node": ">=22" },
  "license": "MIT"
}
```

Pin versions if `0.13.0` for system is wrong — resolve with `pnpm view @solana-program/system version` and peer range on stake (`@solana/kit ^7`).

`tsup.config.ts`:
```ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: [
    "@guardian-sdk/sdk",
    "@solana/kit",
    "@solana/sysvars",
    "@solana-program/stake",
    "@solana-program/system",
  ],
});
```

- [ ] **Step 2: Chain constant**

```ts
// packages/solana/src/chain/index.ts
import type { GuardianChain } from "@guardian-sdk/sdk";

export const solanaMainnet: GuardianChain = {
  id: "solana-mainnet",
  type: "Solana",
  symbol: "SOL",
  decimals: 9,
  ecosystem: "Solana",
  chainId: undefined,
  explorer: "https://explorer.solana.com",
};

export const chains = { solanaMainnet } as const;
export const SUPPORTED_CHAINS: GuardianChain[] = [solanaMainnet];
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((c) => c.id === id);
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some((c) => c.id === chain.id);
```

- [ ] **Step 3: Stub factory that typechecks**

```ts
// packages/solana/src/solana-chain/index.ts
import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl, ValidationError } from "@guardian-sdk/sdk";
import { solanaMainnet } from "../chain";

export interface SolanaConfig {
  rpcUrl: string;
  logger?: Logger;
  defaultComputeUnitPrice?: bigint;
  seedScanGapLimit?: number;
  seedScanMax?: number;
  stakeCacheTtlMs?: number;
  validatorsCacheTtlMs?: number;
  enableGpaFallback?: boolean;
}

export function solana(config: SolanaConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();
  void logger;

  const unsupported = (name: string) => () => {
    throw new ValidationError("UNSUPPORTED_OPERATION", `${name} not implemented yet`);
  };

  return {
    getChainInfo: () => solanaMainnet,
    getValidators: unsupported("getValidators"),
    getDelegations: unsupported("getDelegations"),
    getBalances: unsupported("getBalances"),
    getNonce: () => Promise.resolve(0),
    estimateFee: unsupported("estimateFee"),
    sign: unsupported("sign"),
    prehash: unsupported("prehash"),
    compile: unsupported("compile"),
    broadcast: unsupported("broadcast"),
  };
}
```

```ts
// packages/solana/src/index.ts
export * from "@guardian-sdk/sdk";
export * from "./chain";
export { solana } from "./solana-chain";
export type { SolanaConfig } from "./solana-chain";
```

- [ ] **Step 4: Wire monorepo**

Root `package.json`:
```json
"build": "... && pnpm --filter @guardian-sdk/solana run build",
"test": "... && pnpm --filter @guardian-sdk/solana run test"
```

`eslint.config.mjs` — add `./packages/solana/tsconfig.json` and `tsconfig.test.json`.

`examples/tsconfig.json`:
```json
"@guardian-sdk/solana": ["../packages/solana/src/index.ts"]
```

- [ ] **Step 5: Install & build**

```bash
pnpm install
pnpm --filter @guardian-sdk/solana run build
pnpm --filter @guardian-sdk/solana run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/solana package.json eslint.config.mjs examples/tsconfig.json Claude.md CLAUDE.md pnpm-lock.yaml
git commit -m "feat(solana): scaffold package and monorepo wiring"
```

---

### Task 3: State layer — seeds, activation, stake decode, cache

**Files:**
- Create: `packages/solana/src/solana-chain/state/constants.ts`
- Create: `packages/solana/src/solana-chain/state/seed.ts`
- Create: `packages/solana/src/solana-chain/state/activation.ts`
- Create: `packages/solana/src/solana-chain/state/stake-account.ts`
- Create: `packages/solana/src/solana-chain/state/stake-cache.ts`
- Test: `packages/solana/tests/state/seed.test.ts`
- Test: `packages/solana/tests/state/activation.test.ts`
- Test: fixtures under `packages/solana/tests/fixtures/`

**Interfaces:**
- Produces:
  - `LAMPORTS_PER_SOL = 1_000_000_000n`
  - `STAKE_ACCOUNT_SPACE = 200`
  - `STAKE_PROGRAM_ADDRESS` / system program constants as Kit `Address`
  - `deriveStakeAddress(base: Address, seed: string): Promise<Address>` or sync helper using Kit `getProgramDerivedAddress` is **wrong** — use **create with seed** derivation: `getAddressFromPublicKey` pattern from Kit / `@solana-program/system` `getCreateAccountWithSeedInstruction` docs. Prefer Kit utility if exported; else implement `createWithSeed` hash per Solana: `sha256(base + seed + owner)`.
  - `scanSeedIndices(gapLimit, max): number[]` policy helper
  - `computeStakeActivation(delegation, epoch, history, rate): { effective, activating, deactivating, status: "active"|"activating"|"deactivating"|"inactive" }`
  - `decodeStakeAccount(data: Uint8Array): StakeAccountView | null`
  - `createStakePositionCache(ttlMs): { get, set, delete }` wrapping `createInMemoryCache` from sdk

- [ ] **Step 1: Activation unit tests first (table-driven)**

Cover at least:
1. Bootstrap `activation_epoch == u64::MAX` → fully effective
2. `target_epoch == activation_epoch` → all activating
3. Same-epoch activate+deactivate → zero
4. Not deactivating (`deactivation_epoch == u64::MAX`) after warm-up complete → active
5. Mid-cooldown with synthetic StakeHistory entries

Port logic from design spec §9 / kit `solana-native-staking-internals.md` §7. Warmup rate constant `0.09` for mainnet-era tests; pass as parameter.

- [ ] **Step 2: Implement `activation.ts` pure functions**

No RPC. Export pure functions only.

- [ ] **Step 3: Seed derivation tests + implement**

Known vector: pick a fixed base pubkey + seed `"0"` + stake program owner → assert derived address matches a vector generated once via Kit or Solana CLI offline (commit the expected base58 in the test).

- [ ] **Step 4: Stake account decode**

Prefer `@solana-program/stake` `decodeStakeStateAccount` / fetch codecs. Map to:

```ts
export type StakePositionStatus = "active" | "activating" | "deactivating" | "inactive";

export interface StakePosition {
  stakeAccount: string;       // base58
  seedIndex: number | undefined;
  staker: string;
  withdrawer: string;
  voter: string | undefined;
  lamports: bigint;
  rentExemptReserve: bigint;
  delegatedStake: bigint;
  activationEpoch: bigint;
  deactivationEpoch: bigint;
  creditsObserved: bigint;
  // filled by activation pass:
  effective: bigint;
  activating: bigint;
  deactivating: bigint;
  status: StakePositionStatus;
}
```

- [ ] **Step 5: Cache wrapper**

```ts
export function createStakePositionCache(ttlMs = 30_000) {
  // key: authority base58 → StakePosition[]
  // use createInMemoryCache from @guardian-sdk/sdk
}
```

- [ ] **Step 6: Run tests & commit**

```bash
pnpm --filter @guardian-sdk/solana test -- state
git add packages/solana
git commit -m "feat(solana): seed derivation, activation math, stake decode, cache"
```

---

### Task 4: RPC client

**Files:**
- Create: `packages/solana/src/solana-chain/rpc/*`
- Test: optional thin mock tests in `packages/solana/tests/rpc/` if valuable; otherwise services mock this contract

**Interfaces:**
- Produces `SolanaRpcClientContract`:

```ts
export interface SolanaRpcClientContract {
  getBalance(address: string): Promise<bigint>;
  getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: bigint }>;
  getEpochInfo(): Promise<{ epoch: bigint; slotIndex: bigint; slotsInEpoch: bigint; absoluteSlot: bigint }>;
  getVoteAccounts(): Promise<{ current: VoteAccountInfo[]; delinquent: VoteAccountInfo[] }>;
  getMultipleAccounts(addresses: string[]): Promise<Array<{ address: string; lamports: bigint; data: Uint8Array; owner: string } | null>>;
  getMinimumBalanceForRentExemption(space: number): Promise<bigint>;
  getStakeMinimumDelegation(): Promise<bigint>;
  getFeeForMessage(messageBase64: string): Promise<bigint | null>;
  /** Optional heavy path — only called when enableGpaFallback */
  getProgramAccountsStakeByStaker(staker: string): Promise<Array<{ address: string; lamports: bigint; data: Uint8Array }>>;
  sendTransaction(wireTransactionBase64: string): Promise<string>; // signature
  /** Sysvars */
  getStakeHistory(): Promise<StakeHistoryEntry[]>; // newest first
  getClockEpoch(): Promise<bigint>;
}
```

Implementation uses `createSolanaRpc(rpcUrl)` from `@solana/kit` and `fetchSysvarStakeHistory` / clock from `@solana/sysvars` where applicable. Map errors through existing rpc helpers if useful.

- [ ] **Step 1: Implement client + contract**
- [ ] **Step 2: Typecheck package**
- [ ] **Step 3: Commit**

```bash
git commit -m "feat(solana): RPC client over @solana/kit"
```

---

### Task 5: Tx types, validations, tx-builder

**Files:**
- Create: `packages/solana/src/solana-chain/tx/solana-types.ts`
- Create: `packages/solana/src/solana-chain/tx/validations.ts`
- Create: `packages/solana/src/solana-chain/tx/tx-builder.ts`
- Test: `packages/solana/tests/validations.test.ts`
- Test: `packages/solana/tests/tx/tx-builder.test.ts`

**Interfaces:**
- Produces:

```ts
export const LAMPORTS_PER_SOL = 1_000_000_000n;

export interface SolanaUndelegateTransaction extends UndelegateTransaction {
  stakeAccount: string;
}
export interface SolanaClaimDelegateTransaction extends ClaimDelegateTransaction {
  stakeAccount: string;
}

export interface SolanaSignArgs extends BaseSignArgs {
  _messageBytes?: Uint8Array;
  _wireTransaction?: string;
}

export interface BuildTxResult {
  /** Compiled message bytes (Ed25519 payload) */
  messageBytes: Uint8Array;
  /** Base64 unsigned or partially-signed wire tx as needed by sign path */
  wireTransactionBase64: string;
  /** Fee payer / authority address */
  feePayer: string;
  /** Instructions summary for tests */
  recentBlockhash: string;
}
```

`buildUnsignedTx(deps, tx, fee: SolanaFee): Promise<BuildTxResult>`:
- **Delegate:** resolve next free seed via scan; `getCreateAccountWithSeedInstruction` + `getInitializeCheckedInstruction` + `getDelegateStakeInstruction`; fund `amount + rent`; reject `isMaxAmount`.
- **Undelegate:** require `stakeAccount`; `getDeactivateInstruction`.
- **ClaimDelegate:** require `stakeAccount`; `getWithdrawInstruction` full lamports to authority.
- Unsupported types → throw.

Validations:
- `assertDelegate(tx)` — amount > 0, !isMaxAmount, validator present, account present
- `assertStakeAccount(tx)` — stakeAccount non-empty base58
- Reject Redelegate/ClaimRewards/Vote with clear code

- [ ] **Step 1: Validation tests**
- [ ] **Step 2: Tx-builder tests with mocked RPC** (blockhash, rent, seed free, min delegation) — assert instruction count / program ids where practical; use Kit codecs
- [ ] **Step 3: Implement**
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(solana): transaction builder and validations"
```

---

### Task 6: Staking + balance services (with shared cache)

**Files:**
- Create: `packages/solana/src/solana-chain/services/staking-service.ts`
- Create: `packages/solana/src/solana-chain/services/balance-service.ts`
- Test: `packages/solana/tests/services/staking-service.test.ts`
- Test: `packages/solana/tests/services/balance-service.test.ts`
- Fixtures: vote accounts + multi-account seed responses

**Interfaces:**
- Produces `createStakingService(rpc, cache, config, logger)` and `createBalanceService(rpc, cache, config, logger)` sharing the **same** cache instance from factory.

**`getValidators`:** map `getVoteAccounts`; paginate; cache by page key; `apy: 0`; `operatorAddress` = vote pubkey.

**`getDelegations(address)`:**
1. Load positions via seed-scan (+ optional GPA)
2. Run activation
3. Map to `Delegation[]`:
   - `id` = stake account
   - `status` Active | Pending | Claimable
   - `amount` per design
   - `delegationIndex` = seed index
   - `pendingUntil` epoch ETA when Pending
   - `validator` from vote map or placeholder

**`getBalances(address)`:**
- Available = `getBalance(wallet)`
- Staked / Pending / Claimable aggregates from same positions (cache hit)
- Do **not** return Rewards

- [ ] **Step 1: Tests with mock RPC** — multi-position lifecycle fixtures
- [ ] **Step 2: Implement services**
- [ ] **Step 3: Assert cache shared** — spy that second call within TTL does not re-scan accounts
- [ ] **Step 4: Commit**

```bash
git commit -m "feat(solana): staking and balance services with seed-scan cache"
```

---

### Task 7: Fee, sign, prehash, compile, broadcast

**Files:**
- Create: `packages/solana/src/solana-chain/services/fee-service.ts`
- Create: `packages/solana/src/solana-chain/services/sign-service.ts`
- Create: `packages/solana/src/solana-chain/services/broadcast-service.ts`
- Test: `packages/solana/tests/services/fee-service.test.ts`
- Test: `packages/solana/tests/services/sign-service.test.ts` — **critical: sign vs prehash+compile parity**

**Interfaces:**
- `createFeeService` → `estimateFee(tx): Promise<SolanaFee>`
  - Build message with `defaultComputeUnitPrice`
  - Static CU budgets per op if simulation awkward in unit tests; prefer real Kit estimate when RPC mockable
  - `total` = fee-for-message + priority lamports

- `createSignService`:
  - `privateKey`: 64-char hex → 32-byte seed → Kit `createKeyPairFromPrivateKeyBytes` / `createKeyPairSignerFromPrivateKeyBytes`
  - Reject wrong fee type → `SigningError("INVALID_FEE_TYPE")`
  - `sign` → base64 wire tx
  - `prehash` → `serializedTransaction` = **base64 message bytes**; stash `_messageBytes` / `_wireTransaction` on `SolanaSignArgs`
  - `compile` → `signature` = base64 64-byte Ed25519 sig; return base64 wire tx
  - Assert `sign` wire equals `compile(prehash + localSign(messageBytes))` for each of Delegate/Undelegate/ClaimDelegate

- `createBroadcastService` → `sendTransaction`

**Realistic fixtures:** use Kit to build a real message offline with fixed blockhash for deterministic message bytes when possible (mirror Tron fixture approach).

- [ ] **Step 1: Write sign/prehash/compile parity tests first**
- [ ] **Step 2: Implement fee + sign + broadcast**
- [ ] **Step 3: Wire factory `solana()` fully** (replace stubs)

```ts
export function solana(config: SolanaConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();
  const rpc = createSolanaRpcClient(config.rpcUrl, logger);
  const stakeCache = createStakePositionCache(config.stakeCacheTtlMs ?? 30_000);
  const staking = createStakingService(rpc, stakeCache, config, logger);
  const balance = createBalanceService(rpc, stakeCache, config, logger);
  const fee = createFeeService(rpc, config, logger);
  const sign = createSignService(rpc, config, logger);
  const broadcast = createBroadcastService(rpc, logger);

  return {
    getChainInfo: () => solanaMainnet,
    getValidators: (p) => staking.getValidators(p),
    getDelegations: (a) => staking.getDelegations(a),
    getBalances: (a) => balance.getBalances(a),
    getNonce: () => Promise.resolve(0),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args as SigningWithPrivateKey),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (raw) => broadcast.broadcast(raw),
  };
}
```

- [ ] **Step 4: Export Solana types from package index**
- [ ] **Step 5: Full package test + build**

```bash
pnpm --filter @guardian-sdk/solana test
pnpm --filter @guardian-sdk/solana run build
pnpm --filter @guardian-sdk/solana run typecheck
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(solana): fee estimation, sign/prehash/compile, broadcast, factory wiring"
```

---

### Task 8: Docs, example, rules, root README

**Files:**
- Create: `packages/solana/README.md` (tables: balances, ops, fee, sign, stakeAccount extension, seed scheme)
- Create: `.claude/rules/solana.md` (mental model like tron.md)
- Create: `examples/solana-native-staking-sample.ts`
- Modify: root `README.md` supported chains
- Modify: `docs/adding-a-chain.md` if Solana notes help
- Export types: `SolanaUndelegateTransaction`, `SolanaClaimDelegateTransaction`, `SolanaConfig`, `SolanaFee` (fee from sdk re-export)

- [ ] **Step 1: Write rules + README from design §3–13**
- [ ] **Step 2: Example flow** (commented epoch wait for claim)
- [ ] **Step 3: Typecheck examples**

```bash
npx tsc --noEmit -p examples/tsconfig.json
```

- [ ] **Step 4: Commit**

```bash
git commit -m "docs(solana): README, claude rules, native staking sample"
```

---

### Task 9: Milestone verification + polish pass

- [ ] **Step 1: Full monorepo verification**

```bash
pnpm run build
pnpm run typecheck
pnpm run test
pnpm run lint
pnpm run format:check
```

Expected: all pass. Fix any breakage in other packages from `Fee` union exhaustiveness (switch statements must handle `SolanaFee` or use default).

- [ ] **Step 2: Spec checklist audit**

Walk `docs/superpowers/specs/2026-07-23-solana-staking-design.md` sections 1–18; confirm each in-scope item has code or intentional unsupported throw.

- [ ] **Step 3: Fresh-context review (subagent)** against design + this plan; fix blockers only.

- [ ] **Step 4: Final commit if fixes**

```bash
git commit -m "fix(solana): address verification and review findings"
```

---

## Spec coverage matrix

| Spec section | Task |
|---|---|
| Shared Solana chain + SolanaFee | T1 |
| Package scaffold / plumbing | T2, T8 |
| Seed scheme + activation + cache | T3, T6 |
| RPC surface | T4 |
| Delegate / Undelegate / ClaimDelegate builder | T5 |
| getValidators / getDelegations / getBalances | T6 |
| SolanaFee estimate | T7 |
| sign / prehash / compile / broadcast | T7 |
| Unsupported Redelegate/ClaimRewards/Vote | T5/T7 |
| APR skipped | T6 |
| Example + rules + README | T8 |
| Tests realistic + parity | T3, T5, T6, T7, T9 |

## Out of plan (explicit)

Split/Merge/Move, dual authority, ephemeral stake keys, APR, Redelegate product flow, durable nonce, GPA-default discovery.

---

## Self-review notes (plan author)

- No TBD left for encodings: prehash = base64 message bytes; compile signature = base64 64-byte sig; wire = base64; private key = 32-byte seed hex.
- Seed derivation must use **createWithSeed** algorithm, not PDA.
- Fee union changes may require exhaustiveness fixes in BSC/Cardano/Tron if they switch on `fee.type` without default — handle in T9.
- `@solana-program/system` exact version: confirm at install time against peer of stake 0.8.
```
