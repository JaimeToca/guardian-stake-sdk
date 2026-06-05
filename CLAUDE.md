# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
```

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

Both factory functions wire all services and return a plain object implementing `GuardianServiceContract` — no facade class.

### BSC

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

### Cardano

**Service wiring**: `cardano()` accepts a `CardanoConfig` (`apiKey?`, `baseUrl?`, `logger?`), creates a `BlockfrostRpcClient`, then composes all services.

**Layer breakdown**:
- `packages/cardano/src/cardano-chain/index.ts` — `cardano()` factory
- `packages/cardano/src/chain/index.ts` — `cardanoMainnet` chain definition and `chains` registry
- `packages/cardano/src/cardano-chain/services/` — Service factory functions:
  - `createStakingService` — stake pools and delegations via Blockfrost
  - `createBalanceService` — available and staked ADA balances (lovelaces)
  - `createFeeService` — fee estimation from protocol params + coin selection
  - `createSignService` — signs or pre-hashes Cardano transactions
  - `createBroadcastService` — submits CBOR hex via Blockfrost
- `packages/cardano/src/cardano-chain/rpc/` — Blockfrost HTTP client:
  - `createBlockfrostRpcClient` — wraps Blockfrost REST API (`BlockfrostRpcClientContract`)
- `packages/cardano/src/cardano-chain/tx/` — Transaction construction:
  - `tx-builder.ts` — assembles `Cardano.TxBody` and serialises to CBOR hex via `@cardano-sdk/core`
  - `coin-selection.ts` — UTXO selection for transaction inputs
  - `tx-types.ts` — internal transaction body and witness types

**Cardano specifics**:
- Uses UTXOs (no account nonce — `getNonce()` always resolves to `0`)
- Native currency is lovelaces: 1 ADA = 1,000,000 lovelaces (`decimals: 6`)
- Addresses: payment addresses for UTXOs, stake addresses (`stake1...`) for delegations
- No `chainId` — Cardano uses network magic internally

**Cardano signing flow**: Two paths, same interface as BSC but different key material:
1. Direct: `sign({ paymentPrivateKey, stakingPrivateKey })` — both are 32-byte Ed25519 keys (64-char hex)
2. MPC/external: `prehash({ stakingPublicKey })` → external signing → `compile()` — the staking public key is required upfront so the tx body (which embeds stake key hashes) can be built before hashing. `PrehashResult.signArgs._txBodyCbor` carries the serialized body through to `compile()` to prevent a signature mismatch if UTXOs change between calls.

### Shared SDK (`packages/sdk`)

Chain-agnostic interfaces, types, cache utilities, and RPC error helpers. No viem or Cardano dependencies.

Key additions on this branch:
- `chain/chain-types.ts` — `GuardianChain` now includes `type: "Smartchain" | "Cardano"` and `ecosystem: "Ethereum" | "Cardano"`
- `service/sign-service-contract.ts` — extracted `SignServiceContract` interface (`sign`, `prehash`, `compile`)

**Adding a new chain**: Create a new directory parallel to `packages/bsc/src/smartchain/` and `packages/cardano/src/cardano-chain/` with a `<chain>()` factory function that wires its own services and returns a plain `GuardianServiceContract` object.

**Dependencies**:
- `@guardian-sdk/sdk`: `axios` only
- `@guardian-sdk/bsc`: `@guardian-sdk/sdk`, `viem` (peer dep)
- `@guardian-sdk/cardano`: `@guardian-sdk/sdk` (peer dep), `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`
