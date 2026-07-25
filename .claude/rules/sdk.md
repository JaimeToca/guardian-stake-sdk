---
globs: packages/sdk/**
---
# Shared SDK

Chain-agnostic interfaces, types, cache utilities, and RPC error helpers. No viem or Cardano dependencies.

- `chain/chain-types.ts` — `GuardianChain` includes `type: "Smartchain" | "Cardano"` and `ecosystem: "Ethereum" | "Cardano"`
- `service/sign-service-contract.ts` — `SignServiceContract` interface (`sign`, `prehash`, `compile`)

**Adding a new chain**: Create a new directory parallel to `packages/bsc/src/smartchain/` and `packages/cardano/src/cardano-chain/` with a `<chain>()` factory function that wires its own services and returns a plain `GuardianServiceContract` object.

**`BalanceType` has both `"Claimable"` and `"Rewards"`** — they are not aliases. `"Claimable"` is used by BSC for delegations that have completed the unbonding period. `"Rewards"` is used by Cardano for accumulated stake rewards sitting in the reward account. Each chain uses only one of them.

**Changing exported types → update READMEs** — the package READMEs document interface shapes as TypeScript code blocks. They don't typecheck automatically, so they drift. Run `/doc-drift` after any change to a public type.

**Dependencies** (peer = consumer installs it; bundled = installs automatically, pinned):
- `@guardian-sdk/sdk`: `axios` only
- `@guardian-sdk/bsc`: `@guardian-sdk/sdk` (peer), `viem` (peer — a `PrivateKeyAccount` crosses the API via `SigningWithAccount`, so it must be one shared copy)
- `@guardian-sdk/cardano`: `@guardian-sdk/sdk` (peer); `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util` (bundled, exact-pinned — internal plumbing, never cross the boundary)
- `@guardian-sdk/tron`: `@guardian-sdk/sdk` (peer); `tronweb`, `json-bigint` (bundled)
- `@guardian-sdk/solana`: `@guardian-sdk/sdk` (peer); `@solana/*`, `@solana-program/*` (bundled)

**Peer vs bundled rule**: a library is a *peer* only if its objects cross the SDK's public API or it must be a shared singleton across chain packages (`viem`, `@guardian-sdk/sdk`). Everything else is a *bundled* `dependency`, pinned to the tested version — best consumer DX (`npm install @guardian-sdk/<chain> @guardian-sdk/sdk`, plus `viem` for bsc only).
