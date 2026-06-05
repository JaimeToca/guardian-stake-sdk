# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

- **Runtime**: Node.js ≥ 22
- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm workspaces
- **Test runner**: vitest
- **Bundler**: tsup
- **Linter / formatter**: ESLint + Prettier
- **Key deps**: viem (BSC), `@cardano-sdk/core` · `crypto` · `util` (Cardano), axios (SDK)

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages (sdk first, then bsc, then cardano)
pnpm run build

# Type-check all packages
pnpm run typecheck

# Run tests
pnpm run test

# Check formatting
pnpm run format:check

# Lint
pnpm run lint
```

## Never Do

- **No classes** — all services are factory functions (`createXxxService()`); never use the `class` keyword
- **No cross-package leaks** — never import `viem` or `@cardano-sdk/*` inside `packages/sdk`; never import `viem` inside `packages/cardano`
- **No `any` types** — use `unknown` and narrow, or define a proper type
- **No build-order skipping** — `packages/sdk` must build before `packages/bsc` or `packages/cardano`
- **No native token logic** — BSC staking deals in BNB only; native token payloads must be rejected upstream

## Code Conventions

- **Factory pattern**: services are created by `createXxx(deps)` functions that close over their dependencies and return a plain object implementing the service contract
- **Address types**: service contracts accept `string` addresses; BSC services cast internally via `parseEvmAddress()`
- **Logger injection**: accept a `Logger` (or `NoopLogger`) through config — never call `console.log` directly
- **Cardano amounts**: always in lovelaces internally; 1 ADA = 1,000,000 lovelaces (`decimals: 6`)
- **No facade class**: `GuardianServiceContract` is a plain object; both `bsc()` and `cardano()` return it directly

## Monorepo Structure

This is a pnpm workspaces monorepo with three packages:

- `packages/sdk` → published as `@guardian-sdk/sdk` — chain-agnostic core (no viem dependency)
- `packages/bsc` → published as `@guardian-sdk/bsc` — BSC implementation (viem peer dep, depends on `@guardian-sdk/sdk`)
- `packages/cardano` → published as `@guardian-sdk/cardano` — Cardano implementation (`@cardano-sdk/*` deps, depends on `@guardian-sdk/sdk`)

Consumers install only the chain package they need (`@guardian-sdk/bsc` or `@guardian-sdk/cardano`), which re-exports everything from `@guardian-sdk/sdk`.

## Architecture

**Entry points**:
- `packages/bsc/src/smartchain/index.ts` exports `bsc()` — factory for BSC
- `packages/cardano/src/cardano-chain/index.ts` exports `cardano()` — factory for Cardano

Both factory functions wire all services and return a plain object implementing `GuardianServiceContract` — no facade class. Chain-specific details load automatically when working inside a package:

- `.claude/rules/bsc.md` — loaded when editing `packages/bsc/**`
- `.claude/rules/cardano.md` — loaded when editing `packages/cardano/**`
- `.claude/rules/sdk.md` — loaded when editing `packages/sdk/**`

**Adding a new chain**: add a `.claude/rules/<chain>.md` file alongside a new `packages/<chain>/` directory.
