# Tron Staking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `@guardian-sdk/tron` package implementing `GuardianServiceContract` for Tron Stake 2.0 (freeze/vote/unfreeze/claim), mirroring the BSC/Cardano packages.

**Architecture:** A `tron()` factory wires a thin FullNode HTTP RPC client + a TronWeb factory into five services (staking, balance, fee, sign, broadcast) and returns a plain `GuardianServiceContract`. TronWeb builds unsigned txs against the configured FullNode; signing is local (secp256k1). Delegations are resource-granular over `getAccount`.

**Tech Stack:** TypeScript (strict), pnpm workspaces, vitest, tsup, `tronweb` (chain lib), `@guardian-sdk/sdk` (peer).

**Design spec:** `docs/superpowers/specs/2026-07-11-tron-staking-design.md`

## Global Constraints

- Node ≥ 22; TypeScript strict; **no classes** (factory functions only); **no `any`** (use `unknown` + narrow).
- Units: **SUN**, `1 TRX = 1_000_000 SUN`, `decimals: 6`. Never "MIST".
- RPC: **FullNode HTTP API only** via TronWeb `fullHost` = config `rpcUrl`. **No TronGrid.**
- All amounts internally `bigint` in SUN.
- Build order: `packages/sdk` → `packages/tron`. `packages/sdk` must not import `tronweb`.
- Logger injected via config (`Logger` or `NoopLogger`); never `console.log`.
- Errors: throw `ValidationError` / `ConfigError` / `SigningError` from `@guardian-sdk/sdk`.
- After any exported-type change in `packages/sdk`, run `/doc-drift` (READMEs drift).
- `@guardian-sdk/tron` publishes under the `alpha` dist-tag and is added to `.changeset/config.json` `ignore` (like `@guardian-sdk/cardano`); never mix it in a changeset with non-ignored packages.

## Reference response shapes (from a reference Tron wallet + Tron docs)

```ts
// POST /wallet/getaccount { address, visible: true }
type RawAccount = {
  balance?: number;                                            // liquid SUN
  frozenV2?: { type?: "ENERGY" | "TRON_POWER"; amount?: number }[]; // BANDWIDTH entry omits `type`
  unfrozenV2?: { type?: "ENERGY"; unfreeze_amount: number; unfreeze_expire_time: number }[];
  votes?: { vote_address: string; vote_count: number }[];      // vote_count = whole TRX
};
// POST /wallet/getReward { address, visible: true } -> { reward?: number }   // SUN
// POST /wallet/listwitnesses -> { witnesses: { address: string; voteCount?: number; url?: string; isJobs?: boolean }[] }
// GET  /wallet/getchainparameters -> { chainParameter: { key: string; value?: number }[] }
// POST /wallet/getbrokerage { address, visible: true } -> { brokerage: number }  // percent SR keeps
// POST /wallet/broadcasttransaction <signedTx> -> { result?: boolean; txid?: string; code?: string; message?: string }
```

---

## Task 1: Shared SDK type foundation

**Files:**
- Modify: `packages/sdk/src/chain/chain-types.ts`
- Modify: `packages/sdk/src/entity/transaction-types.ts`
- Modify: `packages/sdk/src/entity/staking-types.ts`
- Modify: `packages/sdk/src/entity/fee-types.ts`
- Create: `packages/sdk/src/entity/transaction-validation.ts`
- Modify: `packages/sdk/src/index.ts` (export the new guard)
- Modify: `packages/bsc/src/smartchain/services/sign-service.ts` (narrow optional validator)
- Modify: `packages/cardano/src/cardano-chain/services/sign-service.ts` (narrow optional validator)
- Test: `packages/sdk/tests/entity/transaction-validation.test.ts`

**Interfaces:**
- Produces:
  - `GuardianChainType` includes `"Tron"`; `ChainEcosystemType` includes `"Tron"`.
  - `VoteTransaction { type: "Vote"; chain: GuardianChain; amount: bigint; account?: string; validator: Validator | OperatorAddress }` added to `Transaction`; `TransactionType` includes `"Vote"`.
  - `DelegateTransaction.validator?` and `UndelegateTransaction.validator?` are now optional.
  - `DelegationStatus` includes `"Frozen"`.
  - `ResourceFee { type: "ResourceFee"; bandwidth: bigint; energy: bigint; total: bigint }` added to `Fee`; `FeeType` includes `"ResourceFee"`.
  - `assertValidator(tx): asserts tx is { validator: Validator | OperatorAddress }` (throws `ValidationError("INVALID_VALIDATOR", …)`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/sdk/tests/entity/transaction-validation.test.ts
import { describe, it, expect } from "vitest";
import { assertValidator, ValidationError } from "../../src";
import type { DelegateTransaction, GuardianChain } from "../../src";

const chain = {} as GuardianChain;

describe("assertValidator", () => {
  it("throws INVALID_VALIDATOR when validator is missing", () => {
    const tx = { type: "Delegate", chain, amount: 1n, isMaxAmount: false } as DelegateTransaction;
    expect(() => assertValidator(tx)).toThrow(ValidationError);
  });

  it("passes through when validator is present", () => {
    const tx = { type: "Delegate", chain, amount: 1n, isMaxAmount: false, validator: "0xabc" } as DelegateTransaction;
    expect(() => assertValidator(tx)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian-sdk/sdk test -- transaction-validation`
Expected: FAIL — `assertValidator` is not exported.

- [ ] **Step 3: Apply the type changes**

`chain-types.ts`:
```ts
export type GuardianChainType = "Smartchain" | "Cardano" | "Tron";
export type ChainEcosystemType = "Ethereum" | "Cardano" | "Tron";
```

`staking-types.ts` — extend the union and document Tron-only:
```ts
/** "Frozen" is Tron-only: staked (frozen) but not yet voted — earning the resource only, no TRX rewards. */
export type DelegationStatus = "Active" | "Pending" | "Claimable" | "Inactive" | "Frozen";
```

`fee-types.ts`:
```ts
export type FeeType = "GasFee" | "UtxoFee" | "ResourceFee";

/** Tron fee model: resource-based. `total` is the TRX (SUN) burned when free/available resources don't cover it. */
export interface ResourceFee {
  type: "ResourceFee";
  bandwidth: bigint;
  energy: bigint;
  total: bigint;
}

export type Fee = GasFee | UtxoFee | ResourceFee;
```

`transaction-types.ts` — make `validator` optional on Delegate/Undelegate, add `Vote`:
```ts
export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimDelegateTransaction
  | ClaimRewardsTransaction
  | VoteTransaction;

export type TransactionType =
  | "Delegate" | "Undelegate" | "Redelegate" | "ClaimDelegate" | "ClaimRewards" | "Vote";

export interface DelegateTransaction extends BaseTransaction {
  type: "Delegate";
  isMaxAmount: boolean;
  /** Optional: BSC/Cardano require it (enforced at runtime via assertValidator); Tron freeze omits it. */
  validator?: Validator | OperatorAddress;
}

export interface UndelegateTransaction extends BaseTransaction {
  type: "Undelegate";
  isMaxAmount: boolean;
  /** Optional: BSC/Cardano require it; Tron unfreeze omits it. */
  validator?: Validator | OperatorAddress;
}

/**
 * Vote staked Tron Power to a Super Representative. Tron-only.
 * `amount` is in SUN and must be a whole number of TRX (votes = amount / 1_000_000).
 *
 * Supported by: Tron
 */
export interface VoteTransaction extends BaseTransaction {
  type: "Vote";
  validator: Validator | OperatorAddress;
}
```

Create `transaction-validation.ts`:
```ts
import { ValidationError } from "./errors";
import type { Transaction } from "./transaction-types";
import type { Validator, OperatorAddress } from "./staking-types";

/** Runtime guard: BSC/Cardano require a validator even though the field is optional at the type level. */
export function assertValidator(
  tx: Transaction
): asserts tx is Transaction & { validator: Validator | OperatorAddress } {
  if (!("validator" in tx) || tx.validator === undefined) {
    throw new ValidationError(
      "INVALID_VALIDATOR",
      `Transaction type "${tx.type}" requires a validator.`
    );
  }
}
```

Add `"INVALID_VALIDATOR"` to `ValidationErrorCode` in `packages/sdk/src/entity/errors.ts`.

Export from `packages/sdk/src/index.ts`:
```ts
export { assertValidator } from "./entity/transaction-validation";
```

- [ ] **Step 4: Narrow the now-optional validator in BSC & Cardano so they still compile**

In `packages/bsc/src/smartchain/services/sign-service.ts`, at the top of `buildCallData`, before the `switch`, guard the branches that read `.validator`:
```ts
import { assertValidator } from "@guardian-sdk/sdk";
// inside buildCallData, in the Delegate / Undelegate / ClaimDelegate cases (Redelegate uses fromValidator):
case "Delegate":
  assertValidator(transaction);
  return { data: encodeDelegate(getValidatorAddress(transaction.validator)), amount: transaction.amount };
case "Undelegate": {
  assertValidator(transaction);
  const shares = await bnbToShares(transaction);
  return { data: encodeUndelegate(getValidatorAddress(transaction.validator), shares), amount: 0n };
}
case "ClaimDelegate":
  assertValidator(transaction);
  return { data: encodeClaim(getValidatorAddress(transaction.validator), transaction.index), amount: 0n };
```
(`ClaimDelegateTransaction.validator` and `RedelegateTransaction.fromValidator/toValidator` stay required — untouched.)

In `packages/cardano/src/cardano-chain/services/sign-service.ts`, add the same `assertValidator(transaction)` call wherever it dereferences `transaction.validator` for Delegate/Undelegate. Run `pnpm --filter @guardian-sdk/cardano typecheck` and add guards until it compiles.

- [ ] **Step 5: Run tests + typecheck to verify green**

Run: `pnpm --filter @guardian-sdk/sdk test -- transaction-validation`
Expected: PASS.
Run: `pnpm run typecheck`
Expected: PASS across sdk, bsc, cardano.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk packages/bsc/src/smartchain/services/sign-service.ts packages/cardano/src/cardano-chain/services/sign-service.ts
git commit -m "feat(sdk): add Tron chain type, Vote tx, Frozen status, ResourceFee, assertValidator"
```

---

## Task 2: Tron package scaffolding + chain definition

**Files:**
- Create: `packages/tron/package.json`
- Create: `packages/tron/tsconfig.json`
- Create: `packages/tron/tsup.config.ts`
- Create: `packages/tron/vitest.config.ts`
- Create: `packages/tron/src/chain/index.ts`
- Create: `packages/tron/src/index.ts`
- Test: `packages/tron/tests/chain/chain.test.ts`

**Interfaces:**
- Produces: `tronMainnet: GuardianChain`; `chains`, `SUPPORTED_CHAINS`, `getChainById`, `isSupportedChain`; package entry `packages/tron/src/index.ts` re-exporting `@guardian-sdk/sdk`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/chain/chain.test.ts
import { describe, it, expect } from "vitest";
import { tronMainnet, getChainById } from "../../src/chain";

describe("tronMainnet", () => {
  it("has SUN decimals and TRX symbol", () => {
    expect(tronMainnet.decimals).toBe(6);
    expect(tronMainnet.symbol).toBe("TRX");
    expect(tronMainnet.type).toBe("Tron");
    expect(tronMainnet.ecosystem).toBe("Tron");
    expect(tronMainnet.chainId).toBeUndefined();
  });

  it("resolves by id", () => {
    expect(getChainById("tron-mainnet")?.id).toBe("tron-mainnet");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian-sdk/tron test -- chain` — Expected: FAIL (package/file missing).

- [ ] **Step 3: Create scaffolding**

`packages/tron/package.json`:
```json
{
  "name": "@guardian-sdk/tron",
  "version": "0.0.0",
  "description": "Guardian SDK for Tron",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": { ".": { "types": "./dist/index.d.ts", "import": "./dist/index.mjs", "require": "./dist/index.js" } },
  "sideEffects": false,
  "files": ["dist"],
  "publishConfig": { "access": "public", "tag": "alpha" },
  "scripts": { "build": "tsup", "typecheck": "tsc --noEmit", "test": "vitest run", "test:watch": "vitest" },
  "peerDependencies": { "@guardian-sdk/sdk": "workspace:^" },
  "dependencies": { "tronweb": "6.1.0" },
  "devDependencies": { "@guardian-sdk/sdk": "workspace:^", "tsup": "^8.5.1", "vitest": "^4.1.3" },
  "engines": { "node": ">=22" },
  "license": "MIT"
}
```

`packages/tron/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "rootDir": "./src", "outDir": "./dist/cjs" },
  "exclude": ["node_modules", "dist", "tests", "vitest.config.ts", "tsup.config.ts"]
}
```

`packages/tron/tsup.config.ts`:
```ts
import { defineConfig } from "tsup";
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  external: ["tronweb", "@guardian-sdk/sdk"],
});
```

`packages/tron/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```

`packages/tron/src/chain/index.ts`:
```ts
import type { GuardianChain } from "@guardian-sdk/sdk";

/** Tron mainnet configuration. */
export const tronMainnet: GuardianChain = {
  id: "tron-mainnet",
  type: "Tron",
  symbol: "TRX",
  decimals: 6,
  ecosystem: "Tron",
  chainId: undefined,
  explorer: "https://tronscan.org",
};

export const chains = { tronMainnet } as const;
export const SUPPORTED_CHAINS: GuardianChain[] = [tronMainnet];
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((c) => c.id === id);
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some((c) => c.id === chain.id);
```

`packages/tron/src/index.ts`:
```ts
export * from "@guardian-sdk/sdk";
export * from "./chain";
export { tron } from "./tron-chain";
export type { TronConfig } from "./tron-chain";
export type {
  TronResource,
  TronDelegateTransaction,
  TronUndelegateTransaction,
} from "./tron-chain/tx/tron-types";
```
> Note: the `tron` factory and `tron-types` are created in later tasks. If building this task standalone, temporarily comment the last two export blocks and restore them in Task 12/6.

- [ ] **Step 4: Install & run test**

Run: `pnpm install` (registers the workspace + tronweb), then `pnpm --filter @guardian-sdk/tron test -- chain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron pnpm-lock.yaml
git commit -m "feat(tron): scaffold package and tron-mainnet chain definition"
```

---

## Task 3: Tron FullNode RPC client

**Files:**
- Create: `packages/tron/src/tron-chain/rpc/tron-rpc-types.ts`
- Create: `packages/tron/src/tron-chain/rpc/tron-rpc-client-contract.ts`
- Create: `packages/tron/src/tron-chain/rpc/tron-rpc-client.ts`
- Create: `packages/tron/src/tron-chain/rpc/index.ts`
- Test: `packages/tron/tests/rpc/tron-rpc-client.test.ts`

**Interfaces:**
- Produces `TronRpcClientContract`:
  - `getAccount(address: string): Promise<TronAccount>`
  - `getReward(address: string): Promise<bigint>`
  - `listWitnesses(): Promise<TronWitness[]>`
  - `getChainParameters(): Promise<Record<string, number>>`
  - `getBrokerage(address: string): Promise<number>`
  - `broadcast(signedTxJson: string): Promise<string>`
- Types: `TronAccount { balance: bigint; frozen: { resource: TronResource; amount: bigint }[]; unfreezing: { amount: bigint; expireTime: number }[]; votes: { srAddress: string; votes: bigint }[] }`, `TronWitness { address: string; voteCount: bigint; url: string; isSr: boolean }`. (`TronResource` from Task 6; for this task define it locally in `tron-rpc-types.ts` and re-export from `tron-types.ts` later, OR import from `../tx/tron-types` if Task 6 lands first — implement Task 6's `TronResource` line here if building 3 before 6.)

- [ ] **Step 1: Write the failing test** (uses `vi.stubGlobal("fetch", …)`)

```ts
// packages/tron/tests/rpc/tron-rpc-client.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createTronRpcClient } from "../../src/tron-chain/rpc/tron-rpc-client";

function mockFetch(json: unknown) {
  return vi.fn().mockResolvedValue({ ok: true, json: async () => json });
}
afterEach(() => vi.unstubAllGlobals());

describe("createTronRpcClient.getAccount", () => {
  it("maps balance, frozenV2, unfrozenV2, votes into SUN bigints", async () => {
    vi.stubGlobal("fetch", mockFetch({
      balance: 5_000_000,
      frozenV2: [{ amount: 100_000_000 }, { type: "ENERGY", amount: 50_000_000 }, { type: "TRON_POWER" }],
      unfrozenV2: [{ unfreeze_amount: 40_000_000, unfreeze_expire_time: 1893456000000 }],
      votes: [{ vote_address: "TSRxxx", vote_count: 100 }],
    }));
    const rpc = createTronRpcClient("https://node.example");
    const acct = await rpc.getAccount("TWallet");
    expect(acct.balance).toBe(5_000_000n);
    expect(acct.frozen).toEqual([
      { resource: "BANDWIDTH", amount: 100_000_000n },
      { resource: "ENERGY", amount: 50_000_000n },
    ]);
    expect(acct.unfreezing).toEqual([{ amount: 40_000_000n, expireTime: 1893456000000 }]);
    expect(acct.votes).toEqual([{ srAddress: "TSRxxx", votes: 100n }]);
  });
});

describe("createTronRpcClient.getReward", () => {
  it("returns reward in SUN, 0 when absent", async () => {
    vi.stubGlobal("fetch", mockFetch({}));
    const rpc = createTronRpcClient("https://node.example");
    expect(await rpc.getReward("TWallet")).toBe(0n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @guardian-sdk/tron test -- tron-rpc-client` — Expected: FAIL (module missing).

- [ ] **Step 3: Implement types + client**

`tron-rpc-types.ts`:
```ts
export type TronResource = "ENERGY" | "BANDWIDTH";

export interface TronAccount {
  balance: bigint;
  frozen: { resource: TronResource; amount: bigint }[];
  unfreezing: { amount: bigint; expireTime: number }[];
  votes: { srAddress: string; votes: bigint }[];
}

export interface TronWitness {
  address: string;
  voteCount: bigint;
  url: string;
  isSr: boolean;
}
```

`tron-rpc-client-contract.ts`:
```ts
import type { TronAccount, TronWitness } from "./tron-rpc-types";
export interface TronRpcClientContract {
  getAccount(address: string): Promise<TronAccount>;
  getReward(address: string): Promise<bigint>;
  listWitnesses(): Promise<TronWitness[]>;
  getChainParameters(): Promise<Record<string, number>>;
  getBrokerage(address: string): Promise<number>;
  broadcast(signedTxJson: string): Promise<string>;
}
```

`tron-rpc-client.ts`:
```ts
import type { Logger } from "@guardian-sdk/sdk";
import { NoopLogger, ApiError } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "./tron-rpc-client-contract";
import type { TronAccount, TronResource, TronWitness } from "./tron-rpc-types";

const num = (v: unknown): number => (typeof v === "number" ? v : 0);
const big = (v: unknown): bigint => BigInt(num(v));

export function createTronRpcClient(
  rpcUrl: string,
  logger: Logger = new NoopLogger()
): TronRpcClientContract {
  async function post(path: string, body?: unknown): Promise<unknown> {
    const res = await fetch(`${rpcUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) throw new ApiError("Tron RPC error", { status: res.status, type: "ServerResponseError" });
    return res.json();
  }

  return {
    async getAccount(address) {
      const raw = (await post("/wallet/getaccount", { address, visible: true })) as {
        balance?: number;
        frozenV2?: { type?: string; amount?: number }[];
        unfrozenV2?: { unfreeze_amount?: number; unfreeze_expire_time?: number }[];
        votes?: { vote_address: string; vote_count: number }[];
      };
      const frozen = (raw.frozenV2 ?? [])
        .filter((f) => f.type !== "TRON_POWER" && (f.amount ?? 0) > 0)
        .map((f) => ({ resource: (f.type === "ENERGY" ? "ENERGY" : "BANDWIDTH") as TronResource, amount: big(f.amount) }));
      const account: TronAccount = {
        balance: big(raw.balance),
        frozen,
        unfreezing: (raw.unfrozenV2 ?? []).map((u) => ({ amount: big(u.unfreeze_amount), expireTime: num(u.unfreeze_expire_time) })),
        votes: (raw.votes ?? []).map((v) => ({ srAddress: v.vote_address, votes: big(v.vote_count) })),
      };
      return account;
    },
    async getReward(address) {
      const raw = (await post("/wallet/getReward", { address, visible: true })) as { reward?: number };
      return big(raw.reward);
    },
    async listWitnesses() {
      const raw = (await post("/wallet/listwitnesses")) as {
        witnesses?: { address: string; voteCount?: number; url?: string; isJobs?: boolean }[];
      };
      return (raw.witnesses ?? []).map<TronWitness>((w) => ({
        address: w.address,
        voteCount: big(w.voteCount),
        url: w.url ?? "",
        isSr: w.isJobs === true,
      }));
    },
    async getChainParameters() {
      const raw = (await post("/wallet/getchainparameters")) as { chainParameter?: { key: string; value?: number }[] };
      return Object.fromEntries((raw.chainParameter ?? []).map((p) => [p.key, num(p.value)]));
    },
    async getBrokerage(address) {
      const raw = (await post("/wallet/getbrokerage", { address, visible: true })) as { brokerage?: number };
      return num(raw.brokerage);
    },
    async broadcast(signedTxJson) {
      const raw = (await post("/wallet/broadcasttransaction", JSON.parse(signedTxJson))) as {
        result?: boolean; txid?: string; code?: string; message?: string;
      };
      if (raw.result !== true && !raw.txid) {
        logger.error("Tron broadcast failed", { code: raw.code, message: raw.message });
        throw new ApiError(`Tron broadcast failed: ${raw.code ?? "unknown"}`, { type: "ServerResponseError" });
      }
      return raw.txid ?? "";
    },
  };
}
```
> Note: `/wallet/getchainparameters` is sometimes documented as GET. Using POST works on java-tron FullNodes too; if a target node rejects it, switch that one call to a GET. Keep it POST here for a uniform client.

`rpc/index.ts`: `export * from "./tron-rpc-client"; export * from "./tron-rpc-client-contract"; export * from "./tron-rpc-types";`

- [ ] **Step 4: Run test to verify it passes** — Run: `pnpm --filter @guardian-sdk/tron test -- tron-rpc-client` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/rpc packages/tron/tests/rpc
git commit -m "feat(tron): FullNode HTTP RPC client (account, reward, witnesses, params, broadcast)"
```

---

## Task 4: TronWeb factory

**Files:**
- Create: `packages/tron/src/tron-chain/tronweb/tronweb-factory.ts`
- Test: `packages/tron/tests/tronweb/tronweb-factory.test.ts`

**Interfaces:**
- Produces `TronWebFactory { create(privateKey?: string): TronWeb }` via `createTronWebFactory(fullHost: string): TronWebFactory`. `fullHost` is the FullNode URL (no TronGrid).

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/tronweb/tronweb-factory.test.ts
import { describe, it, expect } from "vitest";
import { createTronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";

describe("createTronWebFactory", () => {
  it("creates a TronWeb client bound to the fullHost", () => {
    const factory = createTronWebFactory("https://node.example");
    const tw = factory.create();
    expect(tw.fullNode.host).toBe("https://node.example");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pnpm --filter @guardian-sdk/tron test -- tronweb-factory` — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// tronweb-factory.ts
import { TronWeb } from "tronweb";

export interface TronWebFactory {
  create(privateKey?: string): TronWeb;
}

export function createTronWebFactory(fullHost: string): TronWebFactory {
  return {
    create(privateKey) {
      return new TronWeb({ fullHost, ...(privateKey ? { privateKey } : {}) });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS. (If `tw.fullNode.host` differs across tronweb versions, assert `tw instanceof TronWeb` instead.)

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/tronweb packages/tron/tests/tronweb
git commit -m "feat(tron): TronWeb factory bound to configured FullNode"
```

---

## Task 5: APR calculator (pure)

**Files:**
- Create: `packages/tron/src/tron-chain/apr/apr-calculator.ts`
- Test: `packages/tron/tests/apr/apr-calculator.test.ts`

**Interfaces:**
- Produces `computeApr(input: AprInput): number` where
  `AprInput { validatorVotes: bigint; totalVotes: bigint; isSr: boolean; witness127PayPerBlock: number; witnessPayPerBlock: number; brokeragePercent: number }`.

- [ ] **Step 1: Write the failing test** (hardcoded expected value)

```ts
// packages/tron/tests/apr/apr-calculator.test.ts
import { describe, it, expect } from "vitest";
import { computeApr } from "../../src/tron-chain/apr/apr-calculator";

describe("computeApr", () => {
  it("computes voter APR for a non-SR witness", () => {
    // block_vote_reward=16, votes=1e9, total=4e10, brokerage keeps 20% -> share 0.8
    // annualVoting = 1e9 * (16*28800*365) / 4e10 = 4204800
    // APR = (4204800 * 0.8 / 1e9) * 100 = 0.336384
    const apr = computeApr({
      validatorVotes: 1_000_000_000n, totalVotes: 40_000_000_000n, isSr: false,
      witness127PayPerBlock: 16, witnessPayPerBlock: 16, brokeragePercent: 20,
    });
    expect(apr).toBeCloseTo(0.336384, 6);
  });

  it("returns 0 when the witness has no votes", () => {
    expect(computeApr({
      validatorVotes: 0n, totalVotes: 40_000_000_000n, isSr: true,
      witness127PayPerBlock: 16, witnessPayPerBlock: 16, brokeragePercent: 20,
    })).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apr-calculator.ts
const BLOCKS_PER_DAY = 28_800;
const DAYS_PER_YEAR = 365;
const SR_COUNT = 27;

export interface AprInput {
  validatorVotes: bigint;
  totalVotes: bigint;
  isSr: boolean;
  witness127PayPerBlock: number; // vote reward per block (SUN)
  witnessPayPerBlock: number;    // SR block production reward per block (SUN)
  brokeragePercent: number;      // percent the SR keeps (0..100)
}

/**
 * Voter APR for a witness, per apr_tron.txt.
 * NOTE: the SR block-reward term follows the reference doc; validate against real on-chain
 * numbers during integration and adjust if the doc's dimensional factor is off. See spec §8 [VERIFY].
 */
export function computeApr(input: AprInput): number {
  const validatorVotes = Number(input.validatorVotes);
  const totalVotes = Number(input.totalVotes);
  if (validatorVotes <= 0 || totalVotes <= 0) return 0;

  const annualVoteRewardsPool = input.witness127PayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR;
  const annualVotingRewards = (validatorVotes * annualVoteRewardsPool) / totalVotes;
  const srBlockRewards = input.isSr ? input.witnessPayPerBlock * DAYS_PER_YEAR * SR_COUNT : 0;
  const totalAnnualRewards = annualVotingRewards + srBlockRewards;

  const brokerageShare = 1 - input.brokeragePercent / 100;
  return (totalAnnualRewards * brokerageShare / validatorVotes) * 100;
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/apr packages/tron/tests/apr
git commit -m "feat(tron): APR calculator (voter + SR block-reward terms)"
```

---

## Task 6: Tron transaction types + tx-builder

**Files:**
- Create: `packages/tron/src/tron-chain/tx/tron-types.ts`
- Create: `packages/tron/src/tron-chain/tx/tx-builder.ts`
- Test: `packages/tron/tests/tx/tx-builder.test.ts`

**Interfaces:**
- Produces:
  - `TronResource` — re-exported from `rpc/tron-rpc-types.ts` (canonical in Task 3), not redefined.
  - `TronDelegateTransaction extends DelegateTransaction { resource: TronResource }`.
  - `TronUndelegateTransaction extends UndelegateTransaction { resource: TronResource }`.
  - `TronSignArgs extends BaseSignArgs { _rawTx?: UnsignedTronTx }` and `UnsignedTronTx` (the TronWeb tx object).
  - `buildUnsignedTx(tronWeb: TronWeb, tx: Transaction, ownerAddress: string): Promise<UnsignedTronTx>` — maps SDK `Transaction` → TronWeb `transactionBuilder` call.
  - `SUN_PER_TRX = 1_000_000n`.

- [ ] **Step 1: Write the failing test** (TronWeb transactionBuilder mocked)

```ts
// packages/tron/tests/tx/tx-builder.test.ts
import { describe, it, expect, vi } from "vitest";
import { buildUnsignedTx } from "../../src/tron-chain/tx/tron-types" ; // re-exported from tx-builder via index if preferred
import { buildUnsignedTx as build } from "../../src/tron-chain/tx/tx-builder";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;
const OWNER = "TOwnerAddress";

function fakeTronWeb() {
  return {
    transactionBuilder: {
      freezeBalanceV2: vi.fn().mockResolvedValue({ txID: "f" }),
      unfreezeBalanceV2: vi.fn().mockResolvedValue({ txID: "u" }),
      vote: vi.fn().mockResolvedValue({ txID: "v" }),
      withdrawExpireUnfreeze: vi.fn().mockResolvedValue({ txID: "w" }),
      withdrawBlockRewards: vi.fn().mockResolvedValue({ txID: "r" }),
    },
  } as any;
}

describe("buildUnsignedTx", () => {
  it("maps Delegate -> freezeBalanceV2(amount, resource, owner)", async () => {
    const tw = fakeTronWeb();
    const tx = { type: "Delegate", chain, amount: 100_000_000n, isMaxAmount: false, resource: "BANDWIDTH" } as unknown as Transaction;
    await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.freezeBalanceV2).toHaveBeenCalledWith(100_000_000, "BANDWIDTH", OWNER);
  });

  it("maps Vote -> vote({[sr]: votes}, owner), votes = amount / 1e6", async () => {
    const tw = fakeTronWeb();
    const tx = { type: "Vote", chain, amount: 100_000_000n, validator: "TSR" } as unknown as Transaction;
    await build(tw, tx, OWNER);
    expect(tw.transactionBuilder.vote).toHaveBeenCalledWith({ TSR: 100 }, OWNER);
  });

  it("rejects a non-whole-TRX vote amount", async () => {
    const tw = fakeTronWeb();
    const tx = { type: "Vote", chain, amount: 100_500_000n, validator: "TSR" } as unknown as Transaction;
    await expect(build(tw, tx, OWNER)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

`tron-types.ts` (note: `TronResource` is canonical in `rpc/tron-rpc-types.ts` from Task 3; re-export it here, do NOT redefine):
```ts
import type { BaseSignArgs, DelegateTransaction, UndelegateTransaction } from "@guardian-sdk/sdk";
import type { TronResource } from "../rpc/tron-rpc-types";

export type { TronResource };
export const SUN_PER_TRX = 1_000_000n;

export interface TronDelegateTransaction extends DelegateTransaction {
  resource: TronResource;
}
export interface TronUndelegateTransaction extends UndelegateTransaction {
  resource: TronResource;
}

/** Opaque TronWeb unsigned transaction (has txID, raw_data, raw_data_hex, signature[]). */
export type UnsignedTronTx = { txID: string; raw_data_hex?: string; signature?: string[] } & Record<string, unknown>;

/** Sign args carrying the built raw tx through prehash -> compile (mirrors Cardano's _txBodyCbor). */
export interface TronSignArgs extends BaseSignArgs {
  _rawTx?: UnsignedTronTx;
}
```

`tx-builder.ts`:
```ts
import type { TronWeb } from "tronweb";
import type { OperatorAddress, Transaction, Validator } from "@guardian-sdk/sdk";
import { assertValidator, SigningError, ValidationError } from "@guardian-sdk/sdk";
import { SUN_PER_TRX, type TronDelegateTransaction, type TronUndelegateTransaction, type UnsignedTronTx } from "./tron-types";

const srAddress = (v: Validator | OperatorAddress): string => (typeof v === "string" ? v : v.operatorAddress);

export async function buildUnsignedTx(
  tronWeb: TronWeb,
  tx: Transaction,
  ownerAddress: string
): Promise<UnsignedTronTx> {
  const tb = tronWeb.transactionBuilder;
  switch (tx.type) {
    case "Delegate": {
      const t = tx as TronDelegateTransaction;
      if (t.amount < SUN_PER_TRX) throw new ValidationError("INVALID_AMOUNT", "Freeze amount must be at least 1 TRX.");
      return tb.freezeBalanceV2(Number(t.amount), t.resource, ownerAddress) as Promise<UnsignedTronTx>;
    }
    case "Undelegate": {
      const t = tx as TronUndelegateTransaction;
      return tb.unfreezeBalanceV2(Number(t.amount), t.resource, ownerAddress) as Promise<UnsignedTronTx>;
    }
    case "Vote": {
      assertValidator(tx);
      if (tx.amount % SUN_PER_TRX !== 0n) throw new ValidationError("INVALID_AMOUNT", "Vote amount must be a whole number of TRX.");
      const votes = Number(tx.amount / SUN_PER_TRX);
      if (votes <= 0) throw new ValidationError("INVALID_AMOUNT", "Vote amount must be greater than zero.");
      return tb.vote({ [srAddress(tx.validator)]: votes }, ownerAddress) as Promise<UnsignedTronTx>;
    }
    case "ClaimDelegate":
      return tb.withdrawExpireUnfreeze(ownerAddress) as Promise<UnsignedTronTx>;
    case "ClaimRewards":
      return tb.withdrawBlockRewards(ownerAddress) as Promise<UnsignedTronTx>;
    default:
      throw new SigningError("UNSUPPORTED_TRANSACTION_TYPE", `Tron does not support transaction type "${(tx as Transaction).type}".`);
  }
}
```
Add `re-export` of `buildUnsignedTx` where the test imports it, or fix the test import to `tx-builder`. (Prefer importing from `tx-builder`; delete the stray `tron-types` import line in the test.)

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/tx packages/tron/tests/tx
git commit -m "feat(tron): transaction types + tx-builder mapping to TronWeb"
```

---

## Task 7: Staking validations

**Files:**
- Create: `packages/tron/src/tron-chain/validations.ts`
- Test: `packages/tron/tests/validations.test.ts`

**Interfaces:**
- Consumes: `TronAccount` (Task 3), `TronWitness` (Task 3).
- Produces:
  - `availableTronPower(account: TronAccount): bigint` = `Σ frozen − Σ votes×SUN` (never negative).
  - `assertVote(account: TronAccount, witnesses: TronWitness[], srAddress: string, amountSun: bigint): void`.
  - `assertFreeze(availableBalance: bigint, amountSun: bigint): void`.
  - `assertUnfreeze(account: TronAccount, resource: TronResource, amountSun: bigint): void`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/validations.test.ts
import { describe, it, expect } from "vitest";
import { availableTronPower, assertVote, assertFreeze, assertUnfreeze } from "../src/tron-chain/validations";
import type { TronAccount, TronWitness } from "../src/tron-chain/rpc/tron-rpc-types";

const account: TronAccount = {
  balance: 10_000_000n,
  frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }],
  unfreezing: [],
  votes: [{ srAddress: "TSR", votes: 60n }],
};
const witnesses: TronWitness[] = [{ address: "TSR", voteCount: 1000n, url: "", isSr: true }];

describe("validations", () => {
  it("availableTronPower = frozen - votes*SUN", () => {
    expect(availableTronPower(account)).toBe(40_000_000n); // 100 TRX frozen - 60 voted
  });
  it("assertVote rejects over-voting past available Tron Power", () => {
    expect(() => assertVote(account, witnesses, "TSR", 50_000_000n)).toThrow();
  });
  it("assertVote rejects an unknown SR", () => {
    expect(() => assertVote(account, witnesses, "TUNKNOWN", 10_000_000n)).toThrow();
  });
  it("assertFreeze rejects below 1 TRX and above balance", () => {
    expect(() => assertFreeze(10_000_000n, 500_000n)).toThrow();
    expect(() => assertFreeze(10_000_000n, 20_000_000n)).toThrow();
  });
  it("assertUnfreeze rejects amount above frozen for that resource", () => {
    expect(() => assertUnfreeze(account, "BANDWIDTH", 200_000_000n)).toThrow();
    expect(() => assertUnfreeze(account, "ENERGY", 1_000_000n)).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// validations.ts
import { ValidationError } from "@guardian-sdk/sdk";
import type { TronAccount, TronResource, TronWitness } from "./rpc/tron-rpc-types";
import { SUN_PER_TRX } from "./tx/tron-types";

export function availableTronPower(account: TronAccount): bigint {
  const frozen = account.frozen.reduce((s, f) => s + f.amount, 0n);
  const voted = account.votes.reduce((s, v) => s + v.votes * SUN_PER_TRX, 0n);
  const available = frozen - voted;
  return available > 0n ? available : 0n;
}

export function assertFreeze(availableBalance: bigint, amountSun: bigint): void {
  if (amountSun < SUN_PER_TRX) throw new ValidationError("INVALID_AMOUNT", "Freeze amount must be at least 1 TRX.");
  if (amountSun > availableBalance) throw new ValidationError("INVALID_AMOUNT", "Freeze amount exceeds available balance.");
}

export function assertVote(account: TronAccount, witnesses: TronWitness[], srAddress: string, amountSun: bigint): void {
  if (amountSun <= 0n) throw new ValidationError("INVALID_AMOUNT", "Vote amount must be greater than zero.");
  if (amountSun % SUN_PER_TRX !== 0n) throw new ValidationError("INVALID_AMOUNT", "Vote amount must be a whole number of TRX.");
  if (!witnesses.some((w) => w.address === srAddress)) {
    throw new ValidationError("UNSUPPORTED_OPERATION", `Unknown Super Representative "${srAddress}".`);
  }
  if (amountSun > availableTronPower(account)) {
    throw new ValidationError("INVALID_AMOUNT", "Vote amount exceeds available Tron Power (freeze more TRX first).");
  }
}

export function assertUnfreeze(account: TronAccount, resource: TronResource, amountSun: bigint): void {
  const frozen = account.frozen.find((f) => f.resource === resource)?.amount ?? 0n;
  if (amountSun <= 0n) throw new ValidationError("INVALID_AMOUNT", "Unfreeze amount must be greater than zero.");
  if (amountSun > frozen) throw new ValidationError("INVALID_AMOUNT", `Unfreeze amount exceeds frozen ${resource} balance.`);
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/validations.ts packages/tron/tests/validations.test.ts
git commit -m "feat(tron): staking validations (freeze/vote/unfreeze, Tron Power)"
```

---

## Task 8: Staking service (getValidators + getDelegations)

**Files:**
- Create: `packages/tron/src/tron-chain/services/staking-service.ts`
- Create: `packages/tron/src/tron-chain/services/staking-service-contract.ts`
- Test: `packages/tron/tests/services/staking-service.test.ts`

**Interfaces:**
- Consumes: `TronRpcClientContract` (Task 3), `computeApr` (Task 5), `TronWebFactory` (Task 4, for hex→base58 address conversion via `tronWeb.address.fromHex`).
- Produces `TronStakingServiceContract`:
  - `getValidators(params?): Promise<ValidatorsPage>`
  - `getDelegations(address: string): Promise<Delegations>`
  - `getWitnessMap(): Promise<Map<string, Validator>>` (internal helper reused by getDelegations; cached 3 min).

- [ ] **Step 1: Write the failing test** (resource-granular lifecycle)

```ts
// packages/tron/tests/services/staking-service.test.ts
import { describe, it, expect, vi } from "vitest";
import { createStakingService } from "../../src/tron-chain/services/staking-service";
import type { TronRpcClientContract } from "../../src/tron-chain/rpc/tron-rpc-client-contract";

const witnesses = [{ address: "TSR", voteCount: 1_000_000_000n, url: "https://sr.example", isSr: true }];
const params = { getWitness127PayPerBlock: 16, getWitnessPayPerBlock: 16, getUnfreezeDelayDays: 14 };

function rpc(over: Partial<TronRpcClientContract> = {}): TronRpcClientContract {
  return {
    getAccount: vi.fn(),
    getReward: vi.fn().mockResolvedValue(0n),
    listWitnesses: vi.fn().mockResolvedValue(witnesses),
    getChainParameters: vi.fn().mockResolvedValue(params),
    getBrokerage: vi.fn().mockResolvedValue(20),
    broadcast: vi.fn(),
    ...over,
  };
}
const tronWeb = { address: { fromHex: (a: string) => a } } as any;

describe("getDelegations", () => {
  it("freeze-only -> one Frozen delegation carrying the unstakeable amount", async () => {
    const svc = createStakingService(rpc({
      getAccount: vi.fn().mockResolvedValue({ balance: 0n, frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }], unfreezing: [], votes: [] }),
    }), () => tronWeb);
    const { delegations } = await svc.getDelegations("TWallet");
    expect(delegations).toHaveLength(1);
    expect(delegations[0].status).toBe("Frozen");
    expect(delegations[0].amount).toBe(100_000_000n);
    expect(delegations[0].validator.name).toMatch(/vote/i);
  });

  it("voted -> Active delegation with the real SR", async () => {
    const svc = createStakingService(rpc({
      getAccount: vi.fn().mockResolvedValue({ balance: 0n, frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }], unfreezing: [], votes: [{ srAddress: "TSR", votes: 100n }] }),
    }), () => tronWeb);
    const { delegations } = await svc.getDelegations("TWallet");
    const active = delegations.filter((d) => d.status === "Active");
    expect(active).toHaveLength(1);
    expect(active[0].amount).toBe(100_000_000n);
    expect(active[0].validator.operatorAddress).toBe("TSR");
  });

  it("unbonding -> Pending, matured -> Claimable", async () => {
    const future = Date.now() + 1_000_000;
    const past = Date.now() - 1_000_000;
    const svc = createStakingService(rpc({
      getAccount: vi.fn().mockResolvedValue({ balance: 0n, frozen: [], votes: [],
        unfreezing: [{ amount: 40_000_000n, expireTime: future }, { amount: 10_000_000n, expireTime: past }] }),
    }), () => tronWeb);
    const { delegations } = await svc.getDelegations("TWallet");
    expect(delegations.find((d) => d.status === "Pending")?.amount).toBe(40_000_000n);
    expect(delegations.find((d) => d.status === "Claimable")?.amount).toBe(10_000_000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

`staking-service-contract.ts`:
```ts
import type { Delegations, GetValidatorsParams, Validator, ValidatorsPage } from "@guardian-sdk/sdk";
export interface TronStakingServiceContract {
  getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage>;
  getDelegations(address: string): Promise<Delegations>;
  getWitnessMap(): Promise<Map<string, Validator>>;
}
```

`staking-service.ts`:
```ts
import type { Delegation, Delegations, GetValidatorsParams, Validator, ValidatorsPage } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
import type { TronAccount, TronResource } from "../rpc/tron-rpc-types";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import type { TronStakingServiceContract } from "./staking-service-contract";
import { SUN_PER_TRX } from "../tx/tron-types";
import { computeApr } from "../apr/apr-calculator";

const CACHE_TTL_MS = 3 * 60 * 1000;
const MS_PER_DAY = 86_400_000;

function placeholderValidator(resource: TronResource): Validator {
  return {
    id: `tron-frozen-${resource.toLowerCase()}`,
    status: "Inactive",
    name: "Frozen — vote to earn rewards",
    description: `Staked for ${resource}. Vote for a Super Representative to start earning TRX rewards.`,
    image: undefined,
    apy: 0,
    delegators: undefined,
    operatorAddress: "",
    creditAddress: "",
  };
}

export function createStakingService(
  rpc: TronRpcClientContract,
  tronWebFactory: TronWebFactory
): TronStakingServiceContract {
  let cache: { at: number; witnesses: Validator[]; totalVotes: bigint } | undefined;
  const tronWeb = tronWebFactory.create();
  const toBase58 = (addr: string): string => (addr.startsWith("41") ? tronWeb.address.fromHex(addr) : addr);

  async function load(): Promise<{ witnesses: Validator[]; totalVotes: bigint }> {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache;
    const [raw, params] = await Promise.all([rpc.listWitnesses(), rpc.getChainParameters()]);
    const totalVotes = raw.reduce((s, w) => s + w.voteCount, 0n);
    const witnesses = await Promise.all(
      raw.map(async (w): Promise<Validator> => {
        const address = toBase58(w.address);
        const brokeragePercent = await rpc.getBrokerage(address).catch(() => 20);
        const apy = computeApr({
          validatorVotes: w.voteCount, totalVotes, isSr: w.isSr,
          witness127PayPerBlock: params.getWitness127PayPerBlock ?? 0,
          witnessPayPerBlock: params.getWitnessPayPerBlock ?? 0,
          brokeragePercent,
        });
        return {
          id: address, status: w.isSr ? "Active" : "Inactive",
          name: w.url || address, description: "", image: undefined, apy,
          delegators: undefined, operatorAddress: address, creditAddress: "",
        };
      })
    );
    cache = { at: Date.now(), witnesses, totalVotes };
    return cache;
  }

  async function getWitnessMap(): Promise<Map<string, Validator>> {
    const { witnesses } = await load();
    return new Map(witnesses.map((v) => [v.operatorAddress, v]));
  }

  function unbondPeriodMs(days: number): number {
    return (days > 0 ? days : 14) * MS_PER_DAY;
  }

  return {
    getWitnessMap,

    async getValidators(params?: GetValidatorsParams): Promise<ValidatorsPage> {
      const { witnesses } = await load();
      const page = params?.page ?? 1;
      const pageSize = params?.pageSize ?? witnesses.length;
      const start = (page - 1) * pageSize;
      const data = witnesses.slice(start, start + pageSize);
      return {
        data,
        pagination: {
          page, pageSize, total: witnesses.length,
          totalPages: Math.max(1, Math.ceil(witnesses.length / pageSize)),
          hasNextPage: start + pageSize < witnesses.length,
        },
      };
    },

    async getDelegations(address: string): Promise<Delegations> {
      const [account, witnessMap, params] = await Promise.all([
        rpc.getAccount(address), getWitnessMap(), rpc.getChainParameters(),
      ]);
      const delegations: Delegation[] = [];
      let idx = 0;
      const totalFrozen = account.frozen.reduce((s, f) => s + f.amount, 0n);
      const totalVoted = account.votes.reduce((s, v) => s + v.votes * SUN_PER_TRX, 0n);

      // Active: one per vote
      for (const vote of account.votes) {
        const validator = witnessMap.get(vote.srAddress) ?? placeholderValidator("BANDWIDTH");
        delegations.push({
          id: `${address}:${vote.srAddress}`, validator, amount: vote.votes * SUN_PER_TRX,
          status: "Active", delegationIndex: BigInt(idx++), pendingUntil: 0,
        });
      }
      // Frozen: unvoted remainder (resource-granular; attribute to the largest frozen resource)
      const remainder = totalFrozen - totalVoted;
      if (remainder > 0n) {
        const resource: TronResource = account.frozen.reduce(
          (a, b) => (b.amount > a.amount ? b : a), account.frozen[0] ?? { resource: "BANDWIDTH", amount: 0n }
        ).resource;
        delegations.push({
          id: `${address}:frozen-${resource}`, validator: placeholderValidator(resource), amount: remainder,
          status: "Frozen", delegationIndex: BigInt(idx++), pendingUntil: 0,
        });
      }
      // Pending / Claimable: one per unfreezing entry
      const now = Date.now();
      for (const u of account.unfreezing) {
        const matured = u.expireTime <= now;
        delegations.push({
          id: `${address}:unfreeze-${u.expireTime}`, validator: placeholderValidator("BANDWIDTH"),
          amount: u.amount, status: matured ? "Claimable" : "Pending",
          delegationIndex: BigInt(idx++), pendingUntil: u.expireTime,
        });
      }

      const { witnesses, totalVotes } = await load();
      const maxApy = witnesses.reduce((m, v) => Math.max(m, v.apy), 0);
      return {
        delegations,
        stakingSummary: {
          totalProtocolStake: Number(totalVotes),
          maxApy,
          minAmountToStake: SUN_PER_TRX,
          unboundPeriodInMillis: unbondPeriodMs(params.getUnfreezeDelayDays ?? 14),
          redelegateFeeRate: 0,
          activeValidators: witnesses.filter((v) => v.status === "Active").length,
          totalValidators: witnesses.length,
        },
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/services/staking-service.ts packages/tron/src/tron-chain/services/staking-service-contract.ts packages/tron/tests/services/staking-service.test.ts
git commit -m "feat(tron): staking service — validators (computed APR) + resource-granular delegations"
```

---

## Task 9: Balance service

**Files:**
- Create: `packages/tron/src/tron-chain/services/balance-service.ts`
- Test: `packages/tron/tests/services/balance-service.test.ts`

**Interfaces:**
- Consumes: `TronRpcClientContract`.
- Produces `createBalanceService(rpc): { getBalances(address: string): Promise<Balance[]> }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/services/balance-service.test.ts
import { describe, it, expect, vi } from "vitest";
import { createBalanceService } from "../../src/tron-chain/services/balance-service";

describe("getBalances", () => {
  it("maps to Available/Staked/Pending/Claimable/Rewards without double counting", async () => {
    const now = Date.now();
    const rpc = {
      getAccount: vi.fn().mockResolvedValue({
        balance: 5_000_000n,
        frozen: [{ resource: "BANDWIDTH", amount: 100_000_000n }, { resource: "ENERGY", amount: 50_000_000n }],
        unfreezing: [{ amount: 40_000_000n, expireTime: now + 1_000_000 }, { amount: 10_000_000n, expireTime: now - 1_000_000 }],
        votes: [],
      }),
      getReward: vi.fn().mockResolvedValue(7_000_000n),
    } as any;
    const balances = await createBalanceService(rpc).getBalances("TWallet");
    const by = (t: string) => balances.find((b) => b.type === t)?.amount;
    expect(by("Available")).toBe(5_000_000n);
    expect(by("Staked")).toBe(150_000_000n);
    expect(by("Pending")).toBe(40_000_000n);
    expect(by("Claimable")).toBe(10_000_000n);
    expect(by("Rewards")).toBe(7_000_000n);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// balance-service.ts
import type { Balance } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

export function createBalanceService(rpc: TronRpcClientContract) {
  return {
    async getBalances(address: string): Promise<Balance[]> {
      const [account, rewards] = await Promise.all([rpc.getAccount(address), rpc.getReward(address)]);
      const now = Date.now();
      const staked = account.frozen.reduce((s, f) => s + f.amount, 0n);
      const pending = account.unfreezing.filter((u) => u.expireTime > now).reduce((s, u) => s + u.amount, 0n);
      const claimable = account.unfreezing.filter((u) => u.expireTime <= now).reduce((s, u) => s + u.amount, 0n);
      return [
        { type: "Available", amount: account.balance },
        { type: "Staked", amount: staked },
        { type: "Pending", amount: pending },
        { type: "Claimable", amount: claimable },
        { type: "Rewards", amount: rewards },
      ];
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/services/balance-service.ts packages/tron/tests/services/balance-service.test.ts
git commit -m "feat(tron): balance service (Available/Staked/Pending/Claimable/Rewards)"
```

---

## Task 10: Sign service (sign / prehash / compile) + fee service + broadcast

**Files:**
- Create: `packages/tron/src/tron-chain/services/sign-service.ts`
- Create: `packages/tron/src/tron-chain/services/fee-service.ts`
- Create: `packages/tron/src/tron-chain/services/broadcast-service.ts`
- Test: `packages/tron/tests/services/sign-service.test.ts`

**Interfaces:**
- Consumes: `TronWebFactory`, `TronRpcClientContract`, `buildUnsignedTx`, `TronSignArgs`.
- Produces:
  - `createSignService(tronWebFactory): { sign(args): Promise<string>; prehash(args): Promise<PrehashResult>; compile(args): Promise<string> }`
  - `createFeeService(rpc): { estimateFee(tx: Transaction): Promise<Fee> }` → returns `ResourceFee`.
  - `createBroadcastService(rpc): { broadcast(rawTx: string): Promise<string> }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/services/sign-service.test.ts
import { describe, it, expect, vi } from "vitest";
import { createSignService } from "../../src/tron-chain/services/sign-service";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;

function factory() {
  const signed = { txID: "abc", signature: ["sig"] };
  const tronWeb = {
    defaultAddress: { base58: "TOwner" },
    transactionBuilder: { freezeBalanceV2: vi.fn().mockResolvedValue({ txID: "abc" }) },
    trx: { sign: vi.fn().mockResolvedValue(signed) },
  } as any;
  return { create: () => tronWeb, tronWeb, signed };
}

describe("sign", () => {
  it("builds via TronWeb, signs, returns serialized signed tx json", async () => {
    const f = factory();
    const svc = createSignService(f as any);
    const tx = { type: "Delegate", chain, amount: 1_000_000n, isMaxAmount: false, resource: "BANDWIDTH" } as unknown as Transaction;
    const raw = await svc.sign({ transaction: tx, fee: { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n }, nonce: 0, privateKey: "aa" } as any);
    expect(JSON.parse(raw)).toEqual(f.signed);
    expect(f.tronWeb.trx.sign).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

`sign-service.ts`:
```ts
import type { BaseSignArgs, CompileArgs, PrehashResult, SigningWithPrivateKey } from "@guardian-sdk/sdk";
import { SigningError } from "@guardian-sdk/sdk";
import type { TronWebFactory } from "../tronweb/tronweb-factory";
import { buildUnsignedTx } from "../tx/tx-builder";
import type { TronSignArgs, UnsignedTronTx } from "../tx/tron-types";

export function createSignService(tronWebFactory: TronWebFactory) {
  return {
    async sign(args: SigningWithPrivateKey): Promise<string> {
      if (!args.privateKey) throw new SigningError("INVALID_SIGNING_ARGS", "Tron sign() requires a privateKey.");
      const tronWeb = tronWebFactory.create(args.privateKey);
      const owner = tronWeb.defaultAddress.base58 as string;
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      const signed = await tronWeb.trx.sign(unsigned);
      return JSON.stringify(signed);
    },

    async prehash(args: BaseSignArgs): Promise<PrehashResult> {
      const tronWeb = tronWebFactory.create();
      const owner = (args.transaction.account ?? "") as string;
      if (!owner) throw new SigningError("INVALID_SIGNING_ARGS", "Tron prehash() requires transaction.account (the owner address).");
      const unsigned = await buildUnsignedTx(tronWeb, args.transaction, owner);
      const signArgs: TronSignArgs = { transaction: args.transaction, fee: args.fee, nonce: args.nonce, _rawTx: unsigned };
      return { serializedTransaction: unsigned.txID, signArgs };
    },

    async compile(args: CompileArgs): Promise<string> {
      const rawTx = (args.signArgs as TronSignArgs)._rawTx as UnsignedTronTx | undefined;
      if (!rawTx) throw new SigningError("INVALID_SIGNING_ARGS", "compile() requires signArgs._rawTx from prehash().");
      const signed: UnsignedTronTx = { ...rawTx, signature: [args.signature] };
      return JSON.stringify(signed);
    },
  };
}
```

`fee-service.ts`:
```ts
import type { Fee, Transaction } from "@guardian-sdk/sdk";
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";

/**
 * Tron staking ops consume bandwidth (∝ tx size); energy ≈ 0. When free/available bandwidth
 * doesn't cover it, the shortfall is burned as TRX. This returns a conservative ResourceFee;
 * pure staking ops are typically free when the account holds staked bandwidth.
 */
export function createFeeService(rpc: TronRpcClientContract) {
  const APPROX_STAKING_TX_BANDWIDTH = 300n; // bytes; freeze/vote/withdraw are small, fixed-shape txs
  return {
    async estimateFee(_tx: Transaction): Promise<Fee> {
      const params = await rpc.getChainParameters();
      const bandwidthPrice = BigInt(params.getTransactionFee ?? 1000); // SUN per bandwidth point
      return {
        type: "ResourceFee",
        bandwidth: APPROX_STAKING_TX_BANDWIDTH,
        energy: 0n,
        total: APPROX_STAKING_TX_BANDWIDTH * bandwidthPrice, // worst-case TRX burn if no free bandwidth
      };
    },
  };
}
```

`broadcast-service.ts`:
```ts
import type { TronRpcClientContract } from "../rpc/tron-rpc-client-contract";
export function createBroadcastService(rpc: TronRpcClientContract) {
  return { broadcast: (rawTx: string): Promise<string> => rpc.broadcast(rawTx) };
}
```

- [ ] **Step 4: Run test to verify it passes** — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/services/sign-service.ts packages/tron/src/tron-chain/services/fee-service.ts packages/tron/src/tron-chain/services/broadcast-service.ts packages/tron/tests/services/sign-service.test.ts
git commit -m "feat(tron): sign (sign/prehash/compile), fee (ResourceFee), broadcast services"
```

---

## Task 11: `tron()` factory wiring + integration test

**Files:**
- Create: `packages/tron/src/tron-chain/index.ts`
- Modify: `packages/tron/src/index.ts` (restore the `tron` / tron-types exports if commented in Task 2)
- Test: `packages/tron/tests/tron.test.ts`

**Interfaces:**
- Consumes: every service factory (Tasks 3–10).
- Produces: `tron(config: TronConfig): GuardianServiceContract` and `TronConfig { rpcUrl: string; logger?: Logger }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/tron/tests/tron.test.ts
import { describe, it, expect } from "vitest";
import { tron } from "../src/tron-chain";
import { ConfigError } from "@guardian-sdk/sdk";

describe("tron()", () => {
  it("returns a contract with the Tron chain info", () => {
    const svc = tron({ rpcUrl: "https://node.example" });
    expect(svc.getChainInfo().id).toBe("tron-mainnet");
    expect(svc.getChainInfo().decimals).toBe(6);
  });
  it("rejects an invalid rpcUrl", () => {
    expect(() => tron({ rpcUrl: "not-a-url" })).toThrow(ConfigError);
  });
  it("getNonce always resolves to 0", async () => {
    expect(await tron({ rpcUrl: "https://node.example" }).getNonce("TWallet")).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// tron-chain/index.ts
import type { GuardianServiceContract, Logger, SigningWithPrivateKey } from "@guardian-sdk/sdk";
import { NoopLogger, validateRpcUrl } from "@guardian-sdk/sdk";
import { tronMainnet } from "../chain";
import { createTronRpcClient } from "./rpc/tron-rpc-client";
import { createTronWebFactory } from "./tronweb/tronweb-factory";
import { createStakingService } from "./services/staking-service";
import { createBalanceService } from "./services/balance-service";
import { createFeeService } from "./services/fee-service";
import { createSignService } from "./services/sign-service";
import { createBroadcastService } from "./services/broadcast-service";

export interface TronConfig {
  rpcUrl: string;
  logger?: Logger;
}

/**
 * Creates a GuardianServiceContract for Tron. Pass the result to the `GuardianSDK` constructor.
 *
 * @example
 * const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]);
 */
export function tron(config: TronConfig): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);
  const logger = config.logger ?? new NoopLogger();

  const rpc = createTronRpcClient(config.rpcUrl, logger);
  const tronWebFactory = createTronWebFactory(config.rpcUrl);
  const staking = createStakingService(rpc, tronWebFactory);
  const balance = createBalanceService(rpc);
  const fee = createFeeService(rpc);
  const sign = createSignService(tronWebFactory);
  const broadcast = createBroadcastService(rpc);

  return {
    getChainInfo: () => tronMainnet,
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: () => Promise.resolve(0),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args as SigningWithPrivateKey),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast.broadcast(rawTx),
  };
}
```

- [ ] **Step 4: Run test + full typecheck** — Run: `pnpm --filter @guardian-sdk/tron test` then `pnpm run typecheck` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/tron/src/tron-chain/index.ts packages/tron/src/index.ts packages/tron/tests/tron.test.ts
git commit -m "feat(tron): tron() factory wiring the GuardianServiceContract"
```

---

## Task 12: Documentation, examples, and repo plumbing

**Files:**
- Create: `.claude/rules/tron.md`
- Create: `packages/tron/README.md`
- Create: `examples/tron-native-staking-sample.ts`
- Modify: `examples/tsconfig.json` (add the `@guardian-sdk/tron` path alias → `packages/tron/src`)
- Modify: `CLAUDE.md` (add tron package, build order sdk→bsc/cardano/tron, `tronweb` in key deps)
- Modify: `.changeset/config.json` (add `@guardian-sdk/tron` to `ignore`)
- Create: a changeset for the `packages/sdk` + `packages/bsc` changes from Task 1 (NOT including `@guardian-sdk/tron`)

**Interfaces:** none (docs/config only).

- [ ] **Step 1: Write `.claude/rules/tron.md`** — full mechanics explainer per spec §16.1. Must include the frontmatter `globs: packages/tron/**`, the service wiring + layer breakdown, the freeze→vote→unfreeze→claim lifecycle diagram, "Freeze ≠ Vote earns nothing", resource model, SUN units, balance mapping, two independent claims, partial unstaking, resource-granular `getDelegations` with the placeholder validator + partial-voting rule, computed APR + `[VERIFY]`, the signing flow, and a "keep package docs in sync" footer. Embed the worked samples from spec §16.2.

- [ ] **Step 2: Write `examples/tron-native-staking-sample.ts`** — the full runnable flow from spec §16.2 (freeze → getDelegations shows Frozen → vote → getDelegations shows Active → partial unfreeze → getDelegations shows Pending → ClaimDelegate + ClaimRewards as two txs). Add the path alias to `examples/tsconfig.json`:
```jsonc
"@guardian-sdk/tron": ["packages/tron/src"],
"@guardian-sdk/tron/*": ["packages/tron/src/*"]
```

- [ ] **Step 3: Write `packages/tron/README.md`** — mirror the Cardano README structure: install, quick start, the balance table, the transaction table (Delegate/Undelegate/Vote/ClaimDelegate/ClaimRewards + resource field), the delegation-status table incl. `Frozen`, and the signing section. All amounts in SUN.

- [ ] **Step 4: Update `CLAUDE.md` and `.changeset/config.json`** — add tron to the monorepo structure + build order + `tronweb` key dep; add `"@guardian-sdk/tron"` to the changeset `ignore` array.

- [ ] **Step 5: Add a changeset for the shared/BSC changes**
```bash
# .changeset/tron-shared-types.md — patch/minor for @guardian-sdk/sdk and @guardian-sdk/bsc ONLY
```
```md
---
"@guardian-sdk/sdk": minor
"@guardian-sdk/bsc": patch
---

Add Tron chain type, Vote transaction, Frozen delegation status, ResourceFee, and assertValidator guard.
```
> Do NOT list `@guardian-sdk/tron` here — it's in the changeset `ignore` array; mixing them fails CI (sdk rule: "Changeset ignore trap").

- [ ] **Step 6: Verify everything**

Run:
```bash
pnpm run build          # sdk → bsc → cardano → tron
pnpm run typecheck
pnpm run test
pnpm run format:check
pnpm run lint
npx tsc --noEmit -p examples/tsconfig.json
```
Expected: all PASS. Then run `/doc-drift` to sync package READMEs for the shared-type changes.

- [ ] **Step 7: Commit**

```bash
git add .claude/rules/tron.md packages/tron/README.md examples CLAUDE.md .changeset
git commit -m "docs(tron): rules explainer, README, runnable sample, changeset + plumbing"
```

---

## Self-Review (completed against the spec)

- **Spec coverage:** §4 architecture → Tasks 2–11; §5 shared types → Task 1; §6 tx taxonomy → Task 6; §7 getDelegations → Task 8; §8 getValidators/APR → Tasks 5, 8; §9 balances → Task 9; §10 signing → Task 10; §11 validations → Task 7; §12 fee → Task 10; §13 testing → each task's tests; §14 examples + §16 docs → Task 12; §15 plumbing → Tasks 2, 12; §17 open decisions (alpha/ignore + APR VERIFY) → Task 12 + Task 5 note. No gaps.
- **Type consistency:** `TronResource`, `TronAccount`, `TronWitness`, `SUN_PER_TRX`, `computeApr(AprInput)`, `buildUnsignedTx`, `TronSignArgs._rawTx`, `assertValidator`, `ResourceFee`, `"Frozen"`, `VoteTransaction` are defined once and referenced with matching signatures across tasks.
- **Placeholders:** none — every code step carries real code; the two `[VERIFY]`/endpoint-shape notes are explicit design caveats to settle against a live node during Task 5/Task 12 verification, not missing implementation.
