---
globs: packages/sdk/**
---
# Shared SDK

Chain-agnostic interfaces, types, cache utilities, and RPC error helpers. No viem or Cardano dependencies.

- `chain/chain-types.ts` — `GuardianChain` includes `type: "Smartchain" | "Cardano"` and `ecosystem: "Ethereum" | "Cardano"`
- `service/sign-service-contract.ts` — `SignServiceContract` interface (`sign`, `prehash`, `compile`)

**Adding a new chain**: Create a new directory parallel to `packages/bsc/src/smartchain/` and `packages/cardano/src/cardano-chain/` with a `<chain>()` factory function that wires its own services and returns a plain `GuardianServiceContract` object.

**Changeset `ignore` trap** — `@guardian-sdk/cardano` is in the `ignore` array in `.changeset/config.json`. Never include it in the same changeset file as non-ignored packages (`@guardian-sdk/sdk`, `@guardian-sdk/bsc`). The changesets CLI treats this as an error and CI fails.

**`BalanceType` has both `"Claimable"` and `"Rewards"`** — they are not aliases. `"Claimable"` is used by BSC for delegations that have completed the unbonding period. `"Rewards"` is used by Cardano for accumulated stake rewards sitting in the reward account. Each chain uses only one of them.

**Changing exported types → update READMEs** — the package READMEs document interface shapes as TypeScript code blocks. They don't typecheck automatically, so they drift. Run `/doc-drift` after any change to a public type.

**Dependencies**:
- `@guardian-sdk/sdk`: `axios` only
- `@guardian-sdk/bsc`: `@guardian-sdk/sdk`, `viem` (peer dep)
- `@guardian-sdk/cardano`: `@guardian-sdk/sdk` (peer dep), `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`
