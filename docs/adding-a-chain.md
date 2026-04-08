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

Each chain lives in its own npm package (`packages/<chain>/`) that depends on `@guardian-sdk/sdk` and re-exports everything from it. Consumers install only the chain package; `@guardian-sdk/sdk` is never installed directly.

```
packages/
  sdk/          → @guardian-sdk/sdk  (chain-agnostic interfaces, utilities, mock helpers)
  bsc/          → @guardian-sdk/bsc  (BSC implementation — reference to copy from)
  <newchain>/   → @guardian-sdk/<newchain>  (your new package)
```

---

## Naming conventions

| Thing | Convention | Example (`tron`) |
|-------|-----------|-----------------|
| Package slug | kebab-case | `tron` |
| npm package | `@guardian-sdk/<slug>` | `@guardian-sdk/tron` |
| Factory function | camelCase slug | `tron(...)` |
| Chain constant | camelCase + `Mainnet` / `Testnet` | `tronMainnet` |
| Chains registry | `chains` object | `chains.tronMainnet` |

---

## Step 1 — Scaffold the package

Create the following directory structure (use `bsc/` as the reference):

```
packages/<newchain>/
  src/
    chain/
      index.ts              ← chain constants and registry
    mainnet/                ← one directory per network environment
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

Define the chain object and the `chains` registry. Copy `bsc/src/chain/index.ts` and adjust:

```typescript
import type { GuardianChain } from "@guardian-sdk/sdk";

/** <ChainName> mainnet configuration. */
export const <chainName>Mainnet: GuardianChain = {
  id: "<chain>-mainnet",          // unique string identifier
  type: "Smartchain",             // TODO: adjust if not EVM
  symbol: "<SYMBOL>",
  decimals: 18,                   // TODO: confirm native token decimals
  ecosystem: "Ethereum",          // TODO: adjust if not EVM
  chainId: "<numeric-chain-id>",
  explorer: "https://<explorer-url>",
};

/**
 * Registry of all chains supported by `@guardian-sdk/<chain>`.
 * Add testnets and additional networks here as they are supported.
 *
 * @example
 * ```typescript
 * import { chains } from "@guardian-sdk/<chain>";
 * sdk.getValidators(chains.<chainName>Mainnet);
 * ```
 */
export const chains = {
  <chainName>Mainnet,
  // <chainName>Testnet,  ← add when testnet is supported
} as const;

/** All chains supported by `@guardian-sdk/<chain>`. */
export const SUPPORTED_CHAINS: GuardianChain[] = Object.values(chains);

/** Retrieves a supported chain by its `id` string (e.g. `"<chain>-mainnet"`). */
export const getChainById = (id: string): GuardianChain | undefined =>
  Object.values(chains).find((chain) => chain.id === id);

/** Returns true if the given chain is in the supported chains list. */
export const isSupportedChain = (chain: GuardianChain): boolean =>
  Object.values(chains).some(
    (supported) => supported.id === chain.id && supported.chainId === chain.chainId
  );
```

**Adding a testnet** is just adding a second entry:

```typescript
export const <chainName>Testnet: GuardianChain = {
  id: "<chain>-testnet",
  // ...
};

export const chains = {
  <chainName>Mainnet,
  <chainName>Testnet,
} as const;
```

`SUPPORTED_CHAINS`, `getChainById`, and `isSupportedChain` automatically pick it up via `Object.values(chains)`.

---

## Step 3 — Implement the service contracts

Every chain package must implement **five service contracts** from `@guardian-sdk/sdk`. All interfaces are in `packages/sdk/src/service/`.

### 3.1 `StakingServiceContract`

```typescript
interface StakingServiceContract {
  getValidators(): Promise<Validator[]>;
  getDelegations(address: string): Promise<Delegations>;
}
```

- `getValidators()` — return ALL validators (active, inactive, jailed). Cache results in `InMemoryCache` from `@guardian-sdk/sdk`.
- `getDelegations(address)` — return active delegations + pending/claimable unbonds + a `StakingSummary` (protocol-level stats: total staked, max APY, min stake amount, unbond period, etc.).
- Validator shape: `{ id, name, status, description, image, apy, delegators, operatorAddress, creditAddress }`.
- Use `"Active" | "Inactive" | "Jailed"` for `ValidatorStatus` and `"Active" | "Pending" | "Claimable"` for `DelegationStatus`.

### 3.2 `BalanceServiceContract`

```typescript
interface BalanceServiceContract {
  getBalances(address: string): Promise<Balance[]>;
}
```

Return an array of `Balance` objects with `type` (`"Available"`, `"Staked"`, `"Pending"`, `"Claimable"`) and `amount` in the chain's native token (as `bigint` in the smallest unit).

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
1. `sign()` — direct signing with a private key string. Validate the key internally.
2. `prehash()` — serialize the unsigned transaction for external/MPC signing. Returns `{ serializedTransaction, signArgs }`.
3. `compile()` — reassemble the signed transaction from a raw hex signature string.

### 3.5 `NonceServiceContract`

```typescript
interface NonceServiceContract {
  getNonce(address: string): Promise<number>;
}
```

Return the next transaction sequence number for the address.

---

## Step 4 — DI factory (`src/mainnet/index.ts`)

This is the file consumers import to configure the chain. Pattern from `bsc`:

```typescript
import { validateRpcUrl, NoopLogger, InMemoryCache } from "@guardian-sdk/sdk";
import type { GuardianServiceContract, Logger } from "@guardian-sdk/sdk";
import { <chainName>Mainnet } from "../chain";
import { GuardianService } from "./services/guardian-service";
// ... other service imports

export function <chain>(config: { rpcUrl: string; logger?: Logger }): GuardianServiceContract {
  validateRpcUrl(config.rpcUrl);   // always validate — throws ConfigError on bad URL
  const logger = config.logger ?? new NoopLogger();
  // wire up your client and services
  return new GuardianService(<chainName>Mainnet, /* services */);
}
```

`validateRpcUrl` is already implemented in `@guardian-sdk/sdk` — no need to re-implement it. It accepts `http`, `https`, `ws`, and `wss` URLs and throws `ConfigError` with code `"INVALID_RPC_URL"` for anything else.

---

## Step 5 — `GuardianService` facade

Implement `GuardianServiceContract` by delegating to the individual services:

```typescript
import type { GuardianServiceContract, GuardianChain } from "@guardian-sdk/sdk";
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
// Re-export everything from @guardian-sdk/sdk so consumers need only one import
export * from "@guardian-sdk/sdk";

// Chain-specific public API
export { <chain> } from "./mainnet";
export { chains, SUPPORTED_CHAINS, getChainById, isSupportedChain } from "./chain";
```

Consumers import `chains` — not individual chain constants — to keep the API consistent across packages:

```typescript
import { <chain>, chains } from "@guardian-sdk/<chain>";
sdk.getValidators(chains.<chainName>Mainnet);
```

---

## Step 7 — Package configuration

### `package.json`

```json
{
  "name": "@guardian-sdk/<chain>",
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
  "publishConfig": { "access": "public" },
  "scripts": {
    "build": "tsc -p tsconfig.json && tsc -p tsconfig.esm.json",
    "typecheck": "tsc --noEmit",
    "prepublishOnly": "pnpm run build",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "peerDependencies": {
    "viem": "^2.0.0"
  },
  "dependencies": {
    "@guardian-sdk/sdk": "*"
  },
  "devDependencies": {
    "viem": "^2.0.0",
    "vitest": "^3.0.0"
  },
  "engines": { "node": ">=22" },
  "keywords": ["<chain>", "staking", "web3", "blockchain", "sdk", "guardian"],
  "license": "MIT"
}
```

> For non-EVM chains that don't depend on viem, remove `peerDependencies` and the `viem` devDependency.

### `tsconfig.json` (CJS build)

Copy from `packages/bsc/tsconfig.json`. Set `"outDir": "./dist/cjs"`.

### `tsconfig.esm.json` (ESM build)

Copy from `packages/bsc/tsconfig.esm.json`. Set `"outDir": "./dist/esm"` and `"module": "ESNext"`.

### `tsconfig.test.json`

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "paths": {
      "@guardian-sdk/sdk": ["../sdk/src/index.ts"],
      "@guardian-sdk/sdk/testing": ["../sdk/src/testing/index.ts"]
    }
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@guardian-sdk/sdk": resolve(__dirname, "../sdk/src/index.ts"),
      "@guardian-sdk/sdk/testing": resolve(__dirname, "../sdk/src/testing/index.ts"),
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
| `tests/services/balance-service.test.ts` | Each balance type returned correctly |
| `tests/services/sign-service.test.ts` | `buildCallData` per tx type, minimum amount enforcement, `prehash` roundtrip, `compile` produces valid hex |

### Mocking strategy

- **Service-layer tests**: mock at the contract interface level. Use `vi.fn()` or implement mock classes — do NOT mock `fetch`/`axios` directly.
- **RPC clients**: do not unit-test raw HTTP calls. Integration tests (not required for CI) can use [MSW](https://mswjs.io) for REST clients.
- **Viem/EVM calls**: use a custom viem transport stub rather than trying to mock HTTP hex responses. See `packages/bsc/tests/services/staking-service.test.ts` for the pattern.
- **Mock fixtures**: use `mockValidator()`, `mockDelegation()`, `mockStakingSummary()`, `mockFee()`, etc. from `@guardian-sdk/sdk/testing`. Add new mock helpers there if new types are introduced.

### Config validation test pattern

```typescript
import { describe, it, expect } from "vitest";
import { ConfigError } from "@guardian-sdk/sdk";
import { <chain> } from "../src/mainnet";

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

### Workspaces

No change needed — `pnpm-workspace.yaml` already uses `packages/*` as a glob.

### Build script

The scaffold script patches `package.json` automatically. If doing it manually, add:

```json
"build": "... && pnpm --filter @guardian-sdk/<chain> run build"
```

### ESLint

Add the new package's tsconfigs to `eslint.config.mjs`:

```js
project: [
  "./packages/sdk/tsconfig.json",
  "./packages/bsc/tsconfig.json",
  "./packages/<newchain>/tsconfig.json",      // ← add
  "./packages/<newchain>/tsconfig.test.json", // ← add
],
```

---

## Step 10 — CI pipeline

The GitHub Actions workflow at `.github/workflows/ci.yml` runs on every PR to `main`:

```
Format check → Lint → Typecheck → Test → Build
```

All steps operate at the monorepo root via pnpm workspaces, so the new package is automatically included once it has the matching scripts in its `package.json`.

**Checklist before opening a PR:**

```bash
pnpm run format:check
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```

---

## Step 11 — Sample (`examples/`)

Add a runnable example script. Create `examples/<chain>-sample.ts`:

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import { <chain>, chains } from "@guardian-sdk/<chain>";

const sdk = new GuardianSDK([
  <chain>({ rpcUrl: "https://<mainnet-rpc>" }),
]);

// Validators
const validators = await sdk.getValidators(chains.<chainName>Mainnet);
console.log("validators", validators.length);

// Delegations
const ADDRESS = "<your-address>";
const { delegations, stakingSummary } = await sdk.getDelegations(chains.<chainName>Mainnet, ADDRESS);
console.log("stakingSummary:", stakingSummary);
console.log("delegations:", delegations);

// Balances
const balances = await sdk.getBalances(chains.<chainName>Mainnet, ADDRESS);
console.log("balances:", balances);
```

Run it locally: `pnpm tsx examples/<chain>-sample.ts`

---

## Step 12 — Chain README (`packages/<chain>/README.md`)

Every chain package needs its own README. Required sections:

### Sections checklist

| Section | Content |
|---------|---------|
| **Overview** | What the chain is, protocol type (PoSA, DPoS, etc.), key protocol parameters |
| **Protocol knowledge** | How staking works on this chain — delegation, unbonding, rewards, slashing. Link to official docs. This is the "encyclopedia" section — explain it thoroughly so developers don't need to look elsewhere. |
| **Installation** | `npm install @guardian-sdk/<chain> viem` |
| **Quick start** | Minimal code snippet to get validators + delegations using `chains.<chainName>Mainnet` |
| **Transaction examples** | Table of real mainnet transactions on the explorer (Delegate, Undelegate, Redelegate, Claim) so developers can inspect the raw call data |
| **Chain constants** | Table: chainId, symbol, decimals, RPC endpoints, explorer, staking contract address |
| **Protocol parameters** | Min delegation amount, unbonding period, redelegation fee (if any), slashing conditions |
| **Error codes** | Tables for `ConfigError`, `ValidationError`, `SigningError` — one row per code with trigger condition |
| **Signing** | Direct (`sign()`), prehash/external (`prehash()` + `compile()`), with code examples |
| **Testing** | How to use `@guardian-sdk/sdk/testing` mock fixtures in consumer tests |

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
[ ] packages/<chain>/src/chain/index.ts          — chain constants + chains registry
[ ] packages/<chain>/src/mainnet/rpc/             — low-level RPC clients
[ ] packages/<chain>/src/mainnet/services/        — 5 service implementations
[ ] packages/<chain>/src/mainnet/index.ts         — DI factory function with validateRpcUrl
[ ] packages/<chain>/src/index.ts                 — public re-exports (re-exports @guardian-sdk/sdk, exports chains)
[ ] packages/<chain>/package.json                 — scripts, deps, exports map, publishConfig
[ ] packages/<chain>/tsconfig.json                — CJS build
[ ] packages/<chain>/tsconfig.esm.json            — ESM build
[ ] packages/<chain>/tsconfig.test.json           — test paths
[ ] packages/<chain>/vitest.config.ts             — @guardian-sdk/sdk alias
[ ] packages/<chain>/tests/<chain>-config.test.ts — config validation tests
[ ] packages/<chain>/tests/services/              — service unit tests
[ ] eslint.config.mjs                             — add new tsconfigs to parserOptions.project
[ ] examples/<chain>-sample.ts                    — runnable sample using chains.<chainName>Mainnet
[ ] packages/<chain>/README.md                    — chain docs with protocol knowledge + tx examples
[ ] README.md (root)                              — update supported chains table
[ ] CI passes: format, lint, typecheck, test, build
```
