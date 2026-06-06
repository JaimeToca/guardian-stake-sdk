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

**Two separate RPC clients — don't mix them**: `createStakingRpcClient` handles EVM contract calls via viem multicall (fee estimation, pooled BNB, credit balances). `createBnbRpcClient` hits the BNB Chain REST API (`api.bnbchain.org`) for validator metadata (name, logo, APY, delegation counts) — it is not EVM. Adding contract interaction logic to `createBnbRpcClient` or metadata fetching to `createStakingRpcClient` breaks the separation.

**Validator cache is already 3 minutes** — `createStakingService` caches per `page+pageSize` key. Don't add a second in-memory cache layer on top.

**Native token rejection is architectural** — `bsc()` deals in BNB only. Native token payloads must be rejected upstream. This was an explicit decision; don't relax it.
