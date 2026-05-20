# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
pnpm install

# Build both packages (sdk first, then bsc)
pnpm run build

# Type-check all packages
pnpm run typecheck

# Run tests
pnpm run test
```

## Monorepo Structure

This is a pnpm workspaces monorepo with two packages:

- `packages/sdk` → published as `@guardian-sdk/sdk` — chain-agnostic core (no viem dependency)
- `packages/bsc` → published as `@guardian-sdk/bsc` — BSC implementation (viem peer dep, depends on `@guardian-sdk/sdk`)

Consumers install only `@guardian-sdk/bsc`, which re-exports everything from `@guardian-sdk/sdk`.

## Architecture

**Entry point**: `packages/bsc/src/smartchain/index.ts` exports `bsc()` — the factory function consumers use. It wires all services together and returns a plain object implementing `GuardianServiceContract`.

**Service wiring**: `bsc()` creates a viem `PublicClient` (with multicall batching enabled), then composes all services and returns a plain object — no facade class.

**Layer breakdown**:
- `packages/bsc/src/smartchain/index.ts` — `bsc()` factory. Creates all services, returns a plain `GuardianServiceContract` object.
- `packages/bsc/src/smartchain/services/` — Service factory functions for BSC:
  - `createStakingService` — validators, delegations, protocol parameters (uses in-memory cache for validators)
  - `createBalanceService` — aggregates available/staked/pending/claimable balances
  - `createFeeService` — fee estimation via transaction simulation
  - `createSignService` — signs transactions or produces a pre-hash for MPC/external signing
  - `getNonce` — plain function, fetches account nonce
  - `broadcast` — plain function, broadcasts a signed transaction
- `packages/bsc/src/smartchain/rpc/` — Low-level RPC client factory functions:
  - `createStakingRpcClient` — interacts with BSC staking contracts via viem multicall
  - `createBnbRpcClient` — fetches validator metadata from BNB Chain's native RPC (not EVM)
- `packages/bsc/src/smartchain/abi/` — ABI encoding/decoding for staking contract calls
- `packages/sdk/src/` — Shared interfaces (`GuardianServiceContract`, `StakingServiceContract`, etc.), types, cache, and RPC error utilities. No viem dependency.

**Address handling**: Service contracts use `string` for addresses throughout. BSC services call `parseEvmAddress(address)` internally to validate and cast to viem's `Address` type.

**Adding a new chain**: Create a new directory parallel to `packages/bsc/src/smartchain/` with a `<chain>()` factory function that wires its own services and returns a plain `GuardianServiceContract` object.

**Signing flow**: Two paths exist:
1. Direct: `sign()` — requires a private key, returns a signed hex tx
2. MPC/external: `preHash()` → external signing → `compile()` — for when you don't control the private key

**Dependencies**:
- `@guardian-sdk/sdk`: `axios` only
- `@guardian-sdk/bsc`: `@guardian-sdk/sdk`, `viem` (peer dep)
