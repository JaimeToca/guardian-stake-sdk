# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Response Style

For routine file edits, reads, and command runs, keep replies short — state what changed, skip unsolicited explanations of what the code does.

## Tech Stack

- **Runtime**: Node.js ≥ 22
- **Language**: TypeScript (strict mode)
- **Package manager**: pnpm workspaces
- **Test runner**: vitest
- **Bundler**: tsup
- **Linter / formatter**: ESLint + Prettier
- **Key deps**: viem (BSC), `@cardano-sdk/core` · `crypto` · `util` (Cardano), `tronweb` (Tron), `@solana/kit` · `@solana/sysvars` · `@solana-program/stake` · `@solana-program/system` (Solana), axios (SDK)

## Commands

```bash
# Install dependencies
pnpm install

# Build all packages (sdk first, then bsc, cardano, tron, and solana)
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
- **No build-order skipping** — `packages/sdk` must build before `packages/bsc`, `packages/cardano`, `packages/tron`, or `packages/solana`
- **No native token logic** — BSC staking deals in BNB only; native token payloads must be rejected upstream

## Code Conventions

- **Factory pattern**: services are created by `createXxx(deps)` functions that close over their dependencies and return a plain object implementing the service contract
- **Address types**: service contracts accept `string` addresses; BSC services cast internally via `parseEvmAddress()`
- **Logger injection**: accept a `Logger` (or `NoopLogger`) through config — never call `console.log` directly
- **Cardano amounts**: always in lovelaces internally; 1 ADA = 1,000,000 lovelaces (`decimals: 6`)
- **No facade class**: `GuardianServiceContract` is a plain object; `bsc()`, `cardano()`, `tron()`, and `solana()` return it directly

## Monorepo Structure

This is a pnpm workspaces monorepo with five packages:

- `packages/sdk` → published as `@guardian-sdk/sdk` — chain-agnostic core (no viem dependency)
- `packages/bsc` → published as `@guardian-sdk/bsc` — BSC implementation (viem peer dep, depends on `@guardian-sdk/sdk`)
- `packages/cardano` → published as `@guardian-sdk/cardano` — Cardano implementation (`@cardano-sdk/*` deps, depends on `@guardian-sdk/sdk`)
- `packages/tron` → published as `@guardian-sdk/tron` — Tron implementation (`tronweb` dep, depends on `@guardian-sdk/sdk`)
- `packages/solana` → published as `@guardian-sdk/solana` — Solana implementation (`@solana/kit` deps, depends on `@guardian-sdk/sdk`)

Consumers install only the chain package they need (`@guardian-sdk/bsc`, `@guardian-sdk/cardano`, `@guardian-sdk/tron`, or `@guardian-sdk/solana`), which re-exports everything from `@guardian-sdk/sdk`.

## Architecture

**Entry points**:
- `packages/bsc/src/smartchain/index.ts` exports `bsc()` — factory for BSC
- `packages/cardano/src/cardano-chain/index.ts` exports `cardano()` — factory for Cardano
- `packages/tron/src/tron-chain/index.ts` exports `tron()` — factory for Tron
- `packages/solana/src/solana-chain/index.ts` exports `solana()` — factory for Solana

Factory functions wire all services and return a plain object implementing `GuardianServiceContract` — no facade class. Chain-specific details load automatically when working inside a package:

- `.claude/rules/bsc.md` — loaded when editing `packages/bsc/**`
- `.claude/rules/cardano.md` — loaded when editing `packages/cardano/**`
- `.claude/rules/tron.md` — loaded when editing `packages/tron/**`
- `.claude/rules/solana.md` — loaded when editing `packages/solana/**`
- `.claude/rules/sdk.md` — loaded when editing `packages/sdk/**`

**Adding a new chain**: add a `.claude/rules/<chain>.md` file alongside a new `packages/<chain>/` directory.

## Model Routing (subagents)

When spawning subagents via the Agent tool, pick the cheapest model that fits the task — don't inherit the orchestrator's model out of habit.

- **Haiku** — data-gathering with no judgment: file search, grep, reads, counting, "find where X is defined", listing usages, summarizing existing code. Default `Explore` and simple `general-purpose` lookups to Haiku.
- **Sonnet** — writing or refactoring code, multi-file edits, synthesis across several sources, and most `chain-debugger` / `ts-blockchain-reviewer` / `test-and-samples-runner` work.
- **Opus** — architecture decisions, subtle multi-step reasoning, and `security-auditor` runs (transaction construction, key handling, fund-safety) where a wrong answer is expensive.

This is guidance, not a hard router: match the model to the work, and reserve Opus for tasks where the cost of being wrong justifies it.

## Project State

Facts that don't live in code but matter for day-to-day decisions:

- **Cardano is stable** — `@guardian-sdk/cardano` is released automatically via semantic-release on the `latest` dist-tag (alongside `@guardian-sdk/sdk` and `@guardian-sdk/bsc`). All packages follow the same conventional-commit-driven release flow on merge to `main`. No special manual steps or ignore lists.
- **`examples/` has its own tsconfig** — `examples/tsconfig.json` uses path aliases pointing to package source. The root `pnpm run typecheck` does **not** cover it. Type-check examples separately with `npx tsc --noEmit -p examples/tsconfig.json`.
