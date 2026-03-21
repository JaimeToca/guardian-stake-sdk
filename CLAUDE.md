# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

There are no npm scripts defined. Use the TypeScript compiler directly:

```bash
# Install dependencies
npm install

# Compile TypeScript to dist/
npx tsc

# Type-check without emitting
npx tsc --noEmit

# Run the sample (after compiling)
node dist/index.js
```

No test runner or linter is configured.

## Architecture

This is a TypeScript SDK for BNB Smart Chain (BSC) native staking. It follows a layered architecture:

**Entry point**: `src/sdk/index.ts` exports `GuardianSDK` — the single public class consumers use. It lazily initializes chain-specific services on first use and caches them by chain ID.

**Service wiring**: `src/smartchain/index.ts` contains `provideGuarService()`, which is the DI factory for BSC. It constructs the viem `PublicClient` (with multicall batching enabled) and composes all services together.

**Layer breakdown**:
- `src/sdk/` — Public API (`GuardianSDK` class). Routes calls to the correct chain's `GuardianServiceContract`.
- `src/smartchain/services/` — Concrete service implementations for BSC:
  - `StakingService` — validators, delegations, protocol parameters (uses in-memory cache for validators)
  - `BalanceService` — aggregates available/staked/pending/claimable balances
  - `FeeService` — fee estimation via transaction simulation
  - `SignService` — signs transactions or produces a pre-hash for MPC/external signing
  - `NonceService` — fetches account nonce
  - `GuardianService` — facade that delegates to the above services, implementing `GuardianServiceContract`
- `src/smartchain/rpc/` — Low-level RPC clients:
  - `StakingRpcClient` — interacts with BSC staking contracts via viem multicall
  - `BNBRpcClient` — fetches validator metadata from BNB Chain's native RPC (not EVM)
- `src/smartchain/abi/` — ABI encoding/decoding for staking contract calls
- `src/common/` — Shared interfaces (`GuardianServiceContract`, `StakingServiceContract`, etc.), types, cache, and RPC error utilities

**Adding a new chain**: Add a new case in `GuardianSDK.getInternalService()` (in `src/sdk/index.ts`) and create a corresponding factory in a new directory parallel to `src/smartchain/`.

**Signing flow**: Two paths exist:
1. Direct: `sign()` — requires a private key, returns a signed hex tx
2. MPC/external: `preHash()` → external signing → `compile()` — for when you don't control the private key

**Dependencies**: `viem` (EVM interactions, ABI encoding) and `axios` (HTTP for BNB native RPC).
