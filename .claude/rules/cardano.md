---
globs: packages/cardano/**
---
# Cardano

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

**Signing flow**: Two paths, same interface as BSC but different key material:
1. Direct: `sign({ paymentPrivateKey, stakingPrivateKey })` — both are 32-byte Ed25519 keys (64-char hex)
2. MPC/external: `prehash({ stakingPublicKey })` → external signing → `compile()` — the staking public key is required upfront so the tx body (which embeds stake key hashes) can be built before hashing. `PrehashResult.signArgs._txBodyCbor` carries the serialized body through to `compile()` to prevent a signature mismatch if UTXOs change between calls.
