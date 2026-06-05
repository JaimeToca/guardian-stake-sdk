---
globs: packages/sdk/**
---
# Shared SDK

Chain-agnostic interfaces, types, cache utilities, and RPC error helpers. No viem or Cardano dependencies.

- `chain/chain-types.ts` — `GuardianChain` includes `type: "Smartchain" | "Cardano"` and `ecosystem: "Ethereum" | "Cardano"`
- `service/sign-service-contract.ts` — `SignServiceContract` interface (`sign`, `prehash`, `compile`)

**Adding a new chain**: Create a new directory parallel to `packages/bsc/src/smartchain/` and `packages/cardano/src/cardano-chain/` with a `<chain>()` factory function that wires its own services and returns a plain `GuardianServiceContract` object.

**Dependencies**:
- `@guardian-sdk/sdk`: `axios` only
- `@guardian-sdk/bsc`: `@guardian-sdk/sdk`, `viem` (peer dep)
- `@guardian-sdk/cardano`: `@guardian-sdk/sdk` (peer dep), `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`
