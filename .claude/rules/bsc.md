---
globs: packages/bsc/**
---
# BSC

**Service wiring**: `bsc()` creates a viem `PublicClient` (with multicall batching enabled), then composes all services.

**Layer breakdown**:
- `packages/bsc/src/smartchain/index.ts` — `bsc()` factory
- `packages/bsc/src/smartchain/services/` — Service factory functions:
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

**Address handling**: Service contracts use `string` for addresses throughout. BSC services call `parseEvmAddress(address)` internally to validate and cast to viem's `Address` type.
