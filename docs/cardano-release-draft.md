# Cardano Release Draft

> This file is a draft for the future `@guardian-sdk/cardano` release.
> It lives in `docs/` (not `.changeset/`) so the changesets tooling never parses it.
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
- `getBalances()` reports `Available` and `Staked` — both equal the spendable wallet balance (`controlled_amount − withdrawable_amount`, since delegation locks nothing), `Staked` dropping to `0` when not delegating — plus `Rewards` (the withdrawable reward balance). Blockfrost's `controlled_amount` already includes rewards, so they are subtracted out to avoid double-counting: `Available + Rewards == controlled_amount`
- `estimateFee()` returns a `UtxoFee` from a single-pass size estimate — using `minFeeB` as the fee-field placeholder so the CBOR width matches the signed tx — plus a 10% safety buffer, accurate given the near-fixed structure of staking transactions
- `sign()` builds and signs `Delegate` / `Redelegate` / `Undelegate` / `ClaimRewards` transactions using `paymentPrivateKey` + `stakingPrivateKey`
- `prehash()` / `compile()` support MPC / external signing: `prehash({ stakingPublicKey })` returns the tx-body hash to sign and carries the serialized body forward, and `compile()` reassembles the signed tx from a `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex` signature
- `sign()` / `prehash()` / `compile()` validate that the supplied keys match the base address's payment and stake credentials; a base address (`addr1q…`) is required (enterprise/pointer/reward addresses are rejected), preventing silently-invalid transactions
- `deriveCardanoKeys(rootKeyHex)` derives payment and staking Ed25519 keys from a BIP32 root key using CIP-1852 paths
- `broadcast()` submits signed CBOR hex to Blockfrost `/tx/submit`
- Reward withdrawals drain the entire reward account (the ledger rejects partial withdrawals): `ClaimRewards` withdraws the full `withdrawable_amount` (the request `amount` is validated but not used as the withdrawal amount), and `Undelegate` auto-sweeps the full balance because the stake deregistration certificate requires an empty reward account
- `Undelegate` on an unregistered stake key is rejected with `UNSUPPORTED_OPERATION`; `Delegate` and `Redelegate` register the stake key (paying the 2 ADA deposit) when it is not yet registered
- UTXO selection paginates lazily — accumulating pages only until enough spendable ADA-only UTXOs cover the target, capped at 5 pages — fixing false "insufficient funds" for wallets with more than 100 UTXOs; native-token UTXOs are skipped
- Blockfrost error handling maps only genuine `404`s to `null`; pools with no registered metadata are detected via an empty object response (`200 {}`) rather than a `404`; all other errors are rethrown
- Mainnet network validation on all address inputs — testnet addresses (`addr_test1...`) are rejected with `INVALID_ADDRESS`
- `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`, and `@guardian-sdk/sdk` are peer dependencies — not bundled, reused if already present in the consumer project
