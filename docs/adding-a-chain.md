# Adding a New Chain to Guardian SDK

This guide walks you through every step required to add a new blockchain to Guardian SDK — from package scaffolding to CI and documentation.

---

## Quick start — scaffold script

**Requirements:** Python 3.8+ (no third-party packages needed — uses only the standard library).

Run the scaffold script to generate the full package skeleton in one command:

```bash
python3 scripts/scaffold_chain.py <chain-id> [options]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--symbol` | Native token symbol | Uppercased chain-id |
| `--chain-id` | Numeric on-chain ID | `0` (fill in later) |
| `--explorer` | Block explorer base URL | `https://<chain>scan.io` |
| `--no-viem` | Omit viem peer dependency | Off (viem included by default) |

**Examples:**

```bash
# EVM chain
python3 scripts/scaffold_chain.py ethereum --symbol ETH --chain-id 1 --explorer https://etherscan.io

# Non-EVM chain (no viem dependency)
python3 scripts/scaffold_chain.py tron --symbol TRX --chain-id 728126428 --explorer https://tronscan.org --no-viem
```

The script creates the following for you automatically:

| What | Where |
|------|-------|
| Full package source + configs | `packages/<chain>/` |
| Config validation + service test stubs | `packages/<chain>/tests/` |
| Runnable example | `examples/<chain>-sample.ts` |
| ESLint tsconfig entries | `eslint.config.mjs` (patched in-place) |
| Root build script entry | `package.json` (patched in-place) |

After running, search for `TODO` across the new package — those are the only places requiring chain-specific logic. Everything structural is already wired.

---

## Overview

Each chain lives in its own npm package (`packages/<chain>/`) that depends on `@guardian/sdk` and re-exports everything from it. Consumers install only the chain package; `@guardian/sdk` is never installed directly.

```
packages/
  sdk/          → @guardian/sdk  (chain-agnostic interfaces, utilities, mock helpers)
  bsc/          → @guardian/bsc  (BSC implementation — reference to copy from)
  <newchain>/   → @guardian/<newchain>  (your new package)
```

---

## Step 1 — Scaffold the package

Create the following directory structure (use `bsc/` as the reference):

```
packages/<newchain>/
  src/
    chain/
      index.ts              ← chain constants
    <network>/              ← e.g. "mainnet", "evm", "cosmos" — whatever fits the chain
      abi/                  ← ABI encoding/decoding (EVM chains only)
      rpc/                  ← low-level RPC clients
        <chain>-rpc-client.ts
        <chain>-rpc-client-contract.ts
        <chain>-rpc-types.ts
        index.ts
      services/
        staking-service.ts
        balance-service.ts
        fee-service.ts
        sign-service.ts
        nonce-service.ts
        guardian-service.ts
      validations.ts
      index.ts              ← DI factory (the `<chain>()` config function)
    index.ts                ← public re-exports
  tests/
    <chain>-config.test.ts  ← config validation tests
    services/
      staking-service.test.ts
      balance-service.test.ts
      sign-service.test.ts
  package.json
  tsconfig.json
  tsconfig.esm.json
  tsconfig.test.json
  vitest.config.ts
  README.md
```

---

## Step 2 — Chain constants (`src/chain/index.ts`)

Define the `GuardianChain` object and chain helpers. Copy `bsc/src/chain/index.ts` and adjust:

```typescript
import type { GuardianChain } from "@guardian/sdk";
import { ChainEcosystemType, GuardianChainType } from "@guardian/sdk";

/** <ChainName> mainnet configuration. */
export const <CHAIN>_CHAIN: GuardianChain = {
  id: "<chain>-mainnet",          // unique string identifier
  type: GuardianChainType.Smartchain,  // or Cosmos, Substrate, etc. if added to the enum
  symbol: "<SYMBOL>",
  decimals: 18,                   // native token decimals
  ecosystem: ChainEcosystemType.Ethereum,  // adjust if not EVM
  chainId: "<numeric-chain-id>",
  explorer: "https://<explorer-url>",
};

export const SUPPORTED_CHAINS: GuardianChain[] = [<CHAIN>_CHAIN];

export const getChainById = (id: string): GuardianChain | undefined =>
  SUPPORTED_CHAINS.find((c) => c.id === id);

export const isSupportedChain = (chain: GuardianChain): boolean =>
  SUPPORTED_CHAINS.some((s) => s.id === chain.id && s.chainId === chain.chainId);
```

---

## Step 3 — Implement the service contracts

Every chain package must implement **five service contracts** from `@guardian/sdk`. All interfaces are in `packages/sdk/src/service/`.

### 3.1 `StakingServiceContract`

```typescript
interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: string): Promise<Delegations>;
}
```

- `getValidators()` — return ALL validators (active, inactive, jailed). Cache results in `InMemoryCache` from `@guardian/sdk`.
- `getDelegations(address)` — return active delegations + pending/claimable unbonds + a `StakingSummary` (protocol-level stats: total staked, max APY, min stake amount, unbond period, etc.).
- Validator shape: `{ id, name, status, description, image, apy, delegators, operatorAddress, creditAddress }`.
- Use `ValidatorStatus.Active / Inactive / Jailed` and `DelegationStatus.Active / Pending / Claimable`.

### 3.2 `BalanceServiceContract`

```typescript
interface BalanceServiceContract {
  getBalances(address: string): Promise<Balance[]>;
}
```

Return an array of `Balance` objects with `type` (`BalanceType.Available`, `Staked`, `Pending`, `Claimable`) and `amount` in the chain's native token (as `bigint` in the smallest unit).

### 3.3 `FeeServiceContract`

```typescript
interface FeeServiceContract {
  estimateFee(transaction: Transaction): Promise<Fee>;
}
```

Simulate the transaction on-chain and return a `Fee` with `{ type: "GasFee", gasPrice, gasLimit, total }`. For non-EVM chains return the appropriate fee type.

### 3.4 `SignServiceContract`

```typescript
interface SignServiceContract {
  sign(signingArgs: SigningWithPrivateKey): Promise<string>;
  prehash(preHashArgs: BaseSignArgs): Promise<PrehashResult>;
  compile(compileArgs: CompileArgs): Promise<string>;
}
```

Three signing paths must be supported:
1. `sign()` — direct signing with a private key.
2. `prehash()` — serialize the unsigned transaction for external/MPC signing. Returns `{ serializedTransaction, signArgs }`.
3. `compile()` — reassemble the signed transaction from raw `r, s, v` (or equivalent) components.

### 3.5 `NonceServiceContract`

```typescript
interface NonceServiceContract {
  getNonce(address: string): Promise<number>;
}
```

Return the next transaction sequence number for the address.

---

## Step 4 — DI factory (`src/<network>/index.ts`)

This is the file consumers import to configure the chain. Pattern from `bsc`:

```typescript
import { validateRpcUrl, NoopLogger, InMemoryCache } from "@guardian/sdk";
import type { GuardianServiceContract, Logger } from "@guardian/sdk";
import { <CHAIN>_CHAIN } from "../chain";
import { GuardianService } from "./services/guardian-service";
// ... other service imports

export function <chain>(config: { rpcUrl: string; logger?: Logger }): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);   // always validate — throws ConfigError on bad URL
  const logger = config.logger ?? new NoopLogger();
  // wire up your client and services
  return new GuardianService(<CHAIN>_CHAIN, /* services */);
}
```

`validateRpcUrl` is already implemented in `@guardian/sdk` — no need to re-implement it. It accepts `http`, `https`, `ws`, and `wss` URLs and throws `ConfigError` with code `INVALID_RPC_URL` for anything else.

---

## Step 5 — `GuardianService` facade

Implement `GuardianServiceContract` by delegating to the individual services:

```typescript
import type { GuardianServiceContract, GuardianChain } from "@guardian/sdk";
// implement all 9 methods from GuardianServiceContract by delegating to injected services
```

The interface requires:
```
getValidators()    → StakingService
getDelegations()   → StakingService
getBalances()      → BalanceService
getNonce()         → NonceService
estimateFee()      → FeeService
sign()             → SignService
prehash()          → SignService
compile()          → SignService
getChainInfo()     → return the GuardianChain constant
```

---

## Step 6 — Public exports (`src/index.ts`)

```typescript
// Re-export everything from @guardian/sdk so consumers need only one import
export * from "@guardian/sdk";

// Chain-specific public API
export { <chain> } from "./<network>";
export { <CHAIN>_CHAIN, SUPPORTED_CHAINS, getChainById, isSupportedChain } from "./chain";
```

---

## Step 7 — Package configuration

### `package.json`

```json
{
  "name": "@guardian/<chain>",
  "version": "0.1.0",
  "description": "Guardian SDK for <ChainName>",
  "main": "./dist/cjs/index.js",
  "module": "./dist/esm/index.js",
  "types": "./dist/cjs/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/cjs/index.d.ts",
      "import": "./dist/esm/index.js",
      "require": "./dist/cjs/index.js"
    }
  },
  "files": ["dist"],
  "sideEffects": false,
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.esm.json",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "npm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "viem": "^2.0.0"
  },
  "dependencies": {
    "@guardian/sdk": "*"
  },
  "devDependencies": {
    "viem": "^2.0.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=18" },
  "keywords": ["<chain>", "staking", "web3", "blockchain", "sdk", "guardian"],
  "license": "MIT"
}
```

> For non-EVM chains that don't depend on viem, remove the `peerDependencies` and `viem` devDependency.

### `tsconfig.json` (CJS build)

Copy from `packages/bsc/tsconfig.json`. Set `"outDir": "./dist/cjs"` and `"module": "commonjs"`.

### `tsconfig.esm.json` (ESM build)

Copy from `packages/bsc/tsconfig.esm.json`. Set `"outDir": "./dist/esm"` and `"module": "ESNext"`.

### `tsconfig.test.json`

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "paths": {
      "@guardian/sdk": ["../sdk/src/index.ts"],
      "@guardian/sdk/testing": ["../sdk/src/testing/index.ts"]
    }
  },
  "include": ["src/**/*", "tests/**/*", "vitest.config.ts"]
}
```

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@guardian/sdk": resolve(__dirname, "../sdk/src/index.ts"),
      "@guardian/sdk/testing": resolve(__dirname, "../sdk/src/testing/index.ts"),
    },
  },
});
```

---

## Step 8 — Tests

### Required test files

| File | What to test |
|------|-------------|
| `tests/<chain>-config.test.ts` | `<chain>()` throws `ConfigError` for bad/missing RPC URLs |
| `tests/services/staking-service.test.ts` | `getValidators()` mapping, cache hit/miss, validator with no credit address, null APY |
| `tests/services/balance-service.test.ts` | Each `BalanceType` returned correctly |
| `tests/services/sign-service.test.ts` | `buildCallData` per tx type, minimum amount enforcement, `prehash` roundtrip, `compile` produces valid hex |

### Mocking strategy

- **Service-layer tests**: mock at the contract interface level. Use `vi.fn()` or implement mock classes — do NOT mock `fetch`/`axios` directly.
- **RPC clients**: do not unit-test raw HTTP calls. Integration tests (not required for CI) can use [MSW](https://mswjs.io) for REST clients.
- **Viem/EVM calls**: use a custom viem transport stub rather than trying to mock HTTP hex responses. See `packages/bsc/tests/services/staking-service.test.ts` for the pattern.
- **Mock fixtures**: use `mockValidator()`, `mockDelegation()`, `mockStakingSummary()`, `mockFee()`, etc. from `@guardian/sdk/testing`. Add new mock helpers there if new types are introduced.

### Config validation test pattern

```typescript
import { describe, it, expect } from "vitest";
import { ConfigError } from "@guardian/sdk";
import { <chain> } from "../src/<network>";

describe("<chain>()", () => {
  it("throws ConfigError for an invalid URL", () => {
    expect.assertions(2);
    try {
      <chain>({ rpcUrl: "not-a-url" });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }
  });
});
```

---

## Step 9 — Wire into root monorepo

### `package.json` (root) — add to workspaces if not already a glob

```json
"workspaces": ["packages/*"]
```

No change needed if using `packages/*` — the new package is picked up automatically.

### `package.json` (root) — add typecheck/lint script references if needed

The root `npm run typecheck` runs `tsc --noEmit` in each workspace. Confirm your new `tsconfig.json` is valid by running:

```bash
npm run typecheck -w packages/<chain>
```

### ESLint (root `eslint.config.js` or `.eslintrc`)

Add the new package's tsconfig to `parserOptions.project`:

```js
parserOptions: {
  project: [
    "./tsconfig.json",
    "./packages/sdk/tsconfig.json",
    "./packages/bsc/tsconfig.json",
    "./packages/<newchain>/tsconfig.json",   // ← add this
  ],
}
```

---

## Step 10 — CI pipeline

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on every PR to `main`:

```
Format check → Lint → Typecheck → Test → Build
```

All five steps must pass for the PR to merge. The pipeline operates at the monorepo root (`npm run <cmd>` which runs the script in every workspace via `--workspaces`), so your new package is automatically included once it has the matching scripts in its `package.json`.

**Checklist before opening a PR:**

```bash
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test               # vitest
npm run build          # must produce dist/ with cjs/ and esm/
```

---

## Step 11 — Sample (`examples/`)

Add a runnable example script. Create `examples/<chain>-sample.ts`:

```typescript
import { GuardianSDK } from "@guardian/sdk";
import { <chain>, <CHAIN>_CHAIN } from "@guardian/<chain>";

const sdk = new GuardianSDK([
  <chain>({ rpcUrl: "https://<mainnet-rpc>" }),
]);

// Validators
const validators = await sdk.getValidators(<CHAIN>_CHAIN);
console.log("validators", validators.length);

// Delegations
const delegations = await sdk.getDelegations("<address>", <CHAIN>_CHAIN);
console.log("delegations", delegations);

// Balances
const balances = await sdk.getBalances("<address>", <CHAIN>_CHAIN);
console.log("balances", balances);
```

Run it locally: `npx tsx examples/<chain>-sample.ts`

---

## Step 12 — Chain README (`packages/<chain>/README.md`)

Every chain package needs its own README. Required sections:

### Sections checklist

| Section | Content |
|---------|---------|
| **Overview** | What the chain is, protocol type (PoSA, DPoS, etc.), key protocol parameters |
| **Protocol knowledge** | How staking works on this chain — delegation, unbonding, rewards, slashing. Link to official docs. This is the "encyclopedia" section — explain it thoroughly so developers don't need to look elsewhere. |
| **Installation** | `npm install @guardian/<chain> viem` |
| **Quick start** | Minimal code snippet to get validators + delegations |
| **Transaction examples** | Table of real mainnet transactions on the explorer (Delegate, Undelegate, Redelegate, Claim) so developers can inspect the raw call data |
| **Chain constants** | Table: chainId, symbol, decimals, RPC endpoints, explorer, staking contract address |
| **Protocol parameters** | Min delegation amount, unbonding period, redelegation fee (if any), slashing conditions |
| **Error codes** | Tables for `ConfigError`, `ValidationError`, `SigningError` — one row per code with trigger condition |
| **Signing** | Direct (`sign()`), prehash/external (`prehash()` + `compile()`), with code examples |
| **Testing** | How to use `@guardian/sdk/testing` mock fixtures in consumer tests |

### Real transaction examples table format

```markdown
| Operation    | Transaction |
|-------------|------------|
| Delegate     | [0xabc…](https://<explorer>/tx/0xabc) |
| Undelegate   | [0xdef…](https://<explorer>/tx/0xdef) |
| Redelegate   | [0xghi…](https://<explorer>/tx/0xghi) |
| Claim        | [0xjkl…](https://<explorer>/tx/0xjkl) |
```

Find real examples by searching the explorer for calls to the staking contract.

---

## Step 13 — Update root README

Add the new chain to:

1. **Supported chains table** — add a row with the chain name, package name, and status badge.
2. **Roadmap table** — if it was listed as "planned", change its status to "available".

---

## Checklist summary

```
[ ] packages/<chain>/src/chain/index.ts          — chain constants
[ ] packages/<chain>/src/<network>/rpc/           — low-level RPC clients
[ ] packages/<chain>/src/<network>/services/      — 5 service implementations
[ ] packages/<chain>/src/<network>/index.ts       — DI factory function with validateRpcUrl
[ ] packages/<chain>/src/index.ts                 — public re-exports (re-exports @guardian/sdk)
[ ] packages/<chain>/package.json                 — scripts, deps, exports map
[ ] packages/<chain>/tsconfig.json                — CJS build
[ ] packages/<chain>/tsconfig.esm.json            — ESM build
[ ] packages/<chain>/tsconfig.test.json           — test paths
[ ] packages/<chain>/vitest.config.ts             — @guardian/sdk alias
[ ] packages/<chain>/tests/<chain>-config.test.ts — config validation tests
[ ] packages/<chain>/tests/services/              — service unit tests
[ ] eslint.config.js                              — add new tsconfig to parserOptions.project
[ ] examples/<chain>-sample.ts                    — runnable sample
[ ] packages/<chain>/README.md                    — chain docs with protocol knowledge + tx examples
[ ] README.md (root)                              — update supported chains table
[ ] CI passes: format, lint, typecheck, test, build
```
