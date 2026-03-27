# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies
npm install

# Build both packages (sdk first, then bsc)
npm run build

# Type-check all packages
npm run typecheck

# Run tests
npm test
```

## Monorepo Structure

This is an npm workspaces monorepo with two packages:

- `packages/sdk` → published as `@guardian/sdk` — chain-agnostic core (no viem dependency)
- `packages/bsc` → published as `@guardian/bsc` — BSC implementation (viem peer dep, depends on `@guardian/sdk`)

Consumers install only `@guardian/bsc`, which re-exports everything from `@guardian/sdk`.

## Architecture

**Entry point**: `packages/bsc/src/sdk/index.ts` exports `GuardianSDK` — the single public class consumers use. It lazily initializes chain-specific services on first use and caches them by chain ID.

**Service wiring**: `packages/bsc/src/smartchain/index.ts` contains `provideGuarService()`, which is the DI factory for BSC. It constructs the viem `PublicClient` (with multicall batching enabled) and composes all services together.

**Layer breakdown**:
- `packages/bsc/src/sdk/` — Public API (`GuardianSDK` class). Routes calls to the correct chain's `GuardianServiceContract`.
- `packages/bsc/src/smartchain/services/` — Concrete service implementations for BSC:
  - `StakingService` — validators, delegations, protocol parameters (uses in-memory cache for validators)
  - `BalanceService` — aggregates available/staked/pending/claimable balances
  - `FeeService` — fee estimation via transaction simulation
  - `SignService` — signs transactions or produces a pre-hash for MPC/external signing
  - `NonceService` — fetches account nonce
  - `GuardianService` — facade that delegates to the above services, implementing `GuardianServiceContract`
- `packages/bsc/src/smartchain/rpc/` — Low-level RPC clients:
  - `StakingRpcClient` — interacts with BSC staking contracts via viem multicall
  - `BNBRpcClient` — fetches validator metadata from BNB Chain's native RPC (not EVM)
- `packages/bsc/src/smartchain/abi/` — ABI encoding/decoding for staking contract calls
- `packages/sdk/src/` — Shared interfaces (`GuardianServiceContract`, `StakingServiceContract`, etc.), types, cache, and RPC error utilities. No viem dependency.

**Address handling**: Service contracts use `string` for addresses throughout. BSC services call `parseEvmAddress(address)` internally to validate and cast to viem's `Address` type.

**Adding a new chain**: Add a new case in `GuardianSDK.getInternalService()` (in `packages/bsc/src/sdk/index.ts`) and create a corresponding factory in a new directory parallel to `packages/bsc/src/smartchain/`.

**Signing flow**: Two paths exist:
1. Direct: `sign()` — requires a private key, returns a signed hex tx
2. MPC/external: `preHash()` → external signing → `compile()` — for when you don't control the private key

**Dependencies**:
- `@guardian/sdk`: `axios` only
- `@guardian/bsc`: `@guardian/sdk`, `viem` (peer dep)
