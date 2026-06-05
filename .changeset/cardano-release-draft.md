# Cardano Release Draft

> This file is a draft for the future `@guardian-sdk/cardano` release.
> It is intentionally missing the changeset frontmatter so it is not consumed by `changeset version`.
>
> When ready to release Cardano:
> 1. Remove `"@guardian-sdk/cardano"` from `ignore` in `.changeset/config.json`
> 2. Run `pnpm changeset` and use the notes below as the description
> 3. Delete this file

---

**`@guardian-sdk/cardano`** — initial release of Cardano native staking support

- `cardano()` factory wires all services and returns a `GuardianServiceContract`
- `getValidators()` returns top 20 stake pools by live stake with estimated APY (10 min cache)
- `getDelegations()` fetches the delegated pool directly — pools outside the top 20 are always indexed
- `getBalances()` reports `Available` (controlled ADA), `Staked` (same as Available — nothing is locked), and `Rewards` (withdrawable rewards) balances
- `estimateFee()` uses iterative fee estimation — feeds the fee back into tx construction up to 3 passes until convergence, ensuring accuracy when a larger fee forces an extra UTXO or changes the CBOR size
- `sign()` builds and signs `Delegate` / `Redelegate` / `Undelegate` / `ClaimRewards` transactions using `paymentPrivateKey` + `stakingPrivateKey`
- `deriveCardanoKeys(rootKeyHex)` derives payment and staking Ed25519 keys from a BIP32 root key using CIP-1852 paths
- `broadcast()` submits signed CBOR hex to Blockfrost `/tx/submit`
- `Undelegate` transactions include an automatic reward sweep — the stake deregistration certificate requires all pending rewards to be withdrawn in the same transaction; the SDK fetches `withdrawable_amount` and adds the withdrawal field automatically
- Blockfrost error handling maps only genuine `404`s to `null`; pools with no registered metadata are detected via an empty object response (`200 {}`) rather than a `404`; all other errors are rethrown
- Mainnet network validation on all address inputs — testnet addresses (`addr_test1...`) are rejected with `INVALID_ADDRESS`
- `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`, and `@guardian-sdk/sdk` are peer dependencies — not bundled, reused if already present in the consumer project
