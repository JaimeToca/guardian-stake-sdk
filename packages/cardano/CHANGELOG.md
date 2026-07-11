# @guardian-sdk/cardano

## 1.0.0

### Major Changes

- Initial stable release of Cardano native staking support. The package is no longer published under the `alpha` dist-tag.

### Features / Changes

- `cardano()` factory wires all services and returns a `GuardianServiceContract`
- `getValidators()` returns top 20 stake pools by live stake with estimated APY (10 min cache)
- `getDelegations()` fetches the delegated pool directly — pools outside the top 20 are always indexed
- `getBalances()` reports `Available` and `Staked` — both equal the spendable wallet balance (`controlled_amount − withdrawable_amount`, since delegation locks nothing), `Staked` dropping to `0` when not delegating — plus `Rewards` (the withdrawable reward balance). Blockfrost's `controlled_amount` already includes rewards, so they are subtracted out to avoid double-counting: `Available + Rewards == controlled_amount`
- `estimateFee()` performs faithful fee estimation: it fetches the on-chain stake registration status and current reward balance, then constructs a complete mock transaction that exactly mirrors the structure of the final signed transaction (separate payment + staking witnesses, real TTL from the tip, the precise set of certificates for the operation, and a full-balance withdrawal for reward account drains). A 10% safety buffer is applied on top of the `minFeeB` estimate. A base address (`addr1q…`) is required.
- `sign()` builds and signs `Delegate` / `Redelegate` / `Undelegate` / `ClaimRewards` transactions using `paymentPrivateKey` + `stakingPrivateKey`
- `prehash()` / `compile()` support MPC / external signing: `prehash({ stakingPublicKey })` returns the Blake2b-256 hash of the tx body to sign and carries the serialized body forward; `compile()` reassembles the signed tx from a `paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex` signature
- `sign()` / `prehash()` / `compile()` validate that the supplied keys match the base address's payment and stake credentials; enterprise, pointer, and reward addresses are rejected
- `deriveCardanoKeys(rootKeyHex)` derives payment and staking Ed25519 keys from a BIP32 root key using CIP-1852 paths
- `broadcast()` submits signed CBOR hex to Blockfrost `/tx/submit`
- Reward withdrawals always drain the **entire** reward account (the ledger rejects partial withdrawals). `ClaimRewards` uses the full `withdrawable_amount`; `Undelegate` automatically sweeps rewards because `StakeDeregistration` requires an empty reward account.
- `Undelegate` on an unregistered stake key is rejected with `UNSUPPORTED_OPERATION`; `Delegate` and `Redelegate` automatically include a `StakeRegistration` certificate (+2 ADA deposit) when the key is not yet registered
- UTXO selection is paged and bounded: it accumulates pages (descending order) only until the pure-ADA spendable total covers the selection target (amount + min UTXO), capped at a safe maximum to prevent pathological "consolidate dust" cases. Native token UTXOs are skipped.
- Blockfrost error handling treats only genuine 404s as `null`; empty metadata objects are handled gracefully; other errors are surfaced
- Strict mainnet address validation — testnet addresses are rejected early with `INVALID_ADDRESS`

- `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`, and `@guardian-sdk/sdk` are peer dependencies — not bundled

## 1.0.0-alpha.0

Initial alpha release (see git history for details).
