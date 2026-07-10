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
  - `tx-helpers.ts` — certificates, withdrawals, min-UTxO, and required-lovelace math
  - `coin-selection.ts` — UTXO selection for transaction inputs
  - `tx-types.ts` — internal transaction body and witness types

**Cardano specifics**:
- Uses UTXOs (no account nonce — `getNonce()` is inlined in the factory and always returns `0`)
- Native currency is lovelaces: 1 ADA = 1,000,000 lovelaces (`decimals: 6`)
- Addresses: payment addresses for UTXOs, stake addresses (`stake1...`) for delegations
- No `chainId` — Cardano uses network magic internally
- Fee estimation and signing use `UtxoFee` (never `GasFee`)

**`@cardano-sdk/*` are exact-pinned peers** — versions are pinned to exact releases (`0.46.12`, `0.4.5`, `0.17.1`) because the family has no stability guarantees between minors and CBOR serialisation is sensitive to the exact release. If you change a version or move these between `dependencies` and `peerDependencies`, run `pnpm install` immediately — forgetting causes CI to fail with `ERR_PNPM_OUTDATED_LOCKFILE`.

**Balance type is `"Rewards"`, not `"Claimable"`** — Cardano accumulated stake rewards use the `"Rewards"` BalanceType. `"Claimable"` is BSC's term for post-unbonding delegations. They are different concepts. Don't use `"Claimable"` in Cardano code or docs.

**Reward withdrawals must drain the FULL balance** — the Cardano ledger rejects partial withdrawals; a `wdrl` entry must equal the reward account's entire `withdrawable_amount`. This applies to both flows: `ClaimRewards` withdraws the full on-chain balance (NOT `transaction.amount` — that field is only validated: `> 0`, `<= balance`), and `Undelegate` sweeps the full balance because `StakeDeregistration` refuses to run while the reward account is non-empty. `resolveChainState()` in `sign-service.ts` fetches `withdrawable_amount` and both `sign()`/`prehash()` use it. Don't reintroduce partial-amount withdrawals — the node will reject the tx.

**`Undelegate` requires a registered key; `Redelegate` self-registers** — `Undelegate` on an unregistered stake key throws `UNSUPPORTED_OPERATION` (nothing to deregister, no deposit to refund). `Redelegate` and `Delegate` prepend a `StakeRegistration` cert (+2 ADA deposit) when the key isn't registered. All of this hinges on the `isStakeKeyRegistered` flag from `resolveChainState()` — keep the account fetch for every staking type.

**Balance: `controlled_amount` already includes rewards** — Blockfrost's `controlled_amount` is the aggregate controlled by the stake key and includes `withdrawable_amount`. `createBalanceService` subtracts rewards so `Available`/`Staked` don't double-count against `Rewards` (`Available + Rewards == controlled_amount`). Don't revert `Available` to raw `controlled_amount`.

**Delegation amount vs balance Staked** — `getDelegations().delegations[].amount` reports the raw `controlled_amount` (includes current rewards) as the economic stake weight. In contrast, `getBalances()` reports `Staked` as `controlled_amount - withdrawable_amount`. This difference is intentional.

**Signing keys must match the payment address** — `sign()`/`prehash()`/`compile()` validate the payment and staking keys against the base address's credentials via `getBaseAddressCredentials()`. A base address (`addr1q…`) is required — enterprise/pointer addresses are rejected because they carry no stake credential. Don't relax this; a key/address mismatch silently produces a tx the node rejects.

**UTXO fetching is paged, with the policy in the selection layer** — `getUtxos(address, page, count)` is a thin single-page fetcher (keeps `order: "desc"` for a stable estimate↔sign ordering). The pagination policy lives in `selectUtxosPaged` (coin-selection.ts): it accumulates pages until the spendable pure-ADA total covers the target (`required + minUtxo`, from `computeSelectionTarget`), capped at `DEFAULT_MAX_UTXO_PAGES` (5). Don't move pagination back into `getUtxos`, and don't drop the cap — it bounds requests for pathological wallets (the "consolidate dust" error is intentional). Selection is decoupled from assembly: `selectUtxosPaged` picks inputs; `buildBody`/`estimateTxSize` receive the pre-selected `{ inputs, totalLovelaces }`.

**Signing flow**: Two paths, same interface as BSC but different key material:
1. Direct: `sign({ paymentPrivateKey, stakingPrivateKey })` — both are 32-byte Ed25519 keys (64-char hex)
2. MPC/external: `prehash({ stakingPublicKey })` → external signing → `compile()`.
   - The staking public key is required upfront because the tx body embeds stake key hashes (in certificates and the withdrawal).
   - `serializedTransaction` returned by `prehash()` is the **Blake2b-256 hash** of the tx body (the exact 32-byte value the Ed25519 signer must sign). It is **not** the CBOR.
   - The actual CBOR body is carried in `signArgs._txBodyCbor` (internal extension) so `compile()` can reconstruct the exact body without re-fetching UTXOs or the tip.
   - `compile()` expects the 4-part signature format: `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex`.
   - `signArgs` from `prehash()` must be passed through unchanged to `compile()`.

`PrehashResult.signArgs._txBodyCbor` (and the full `CardanoPrehashArgs`) is defined in `packages/cardano/src/cardano-chain/sign-types.ts`.

**Balances** — `getBalances()` returns exactly three types: `Available`, `Staked`, and `Rewards`. There is never a `Pending` balance on Cardano.

**Keep package docs in sync** — when you change balance modelling, signing behaviour, fee shapes, or delegation amounts, also update the corresponding tables and examples in `packages/cardano/README.md` (drift between code and that README has happened before).
