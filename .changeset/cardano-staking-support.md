---
"@guardian-sdk/cardano": minor
"@guardian-sdk/sdk": minor
"@guardian-sdk/bsc": patch
---

**`@guardian-sdk/cardano`** — initial release of Cardano native staking support

- `cardano()` factory wires all services and returns a `GuardianServiceContract`
- `getValidators()` returns top 20 stake pools by live stake with estimated APY (10 min cache)
- `getDelegations()` fetches the delegated pool directly — pools outside the top 20 are always indexed
- `getBalances()` reports available, staked (controlled ADA), and claimable (withdrawable rewards) balances
- `estimateFee()` builds a mock transaction to get an accurate byte count, then applies `fee = minFeeA × size + minFeeB`
- `sign()` builds and signs delegate / redelegate / undelegate / claim transactions using `paymentPrivateKey` + `stakingPrivateKey`
- `broadcast()` submits signed CBOR hex to Blockfrost `/tx/submit`
- `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`, and `@guardian-sdk/sdk` are peer dependencies — not bundled, reused if already present in the consumer project

**`@guardian-sdk/sdk`** — extensions to support Cardano

- `GuardianChainType` and `ChainEcosystemType` extended with `"Cardano"`
- `UtxoFee` added to the `Fee` union
- `Validator.delegators` widened to `number | undefined`
- `StakingSummary.activeValidators` and `totalValidators` widened to `number | undefined`
- `GuardianServiceContract.sign()` and `GuardianSDK.sign()` widened to `BaseSignArgs`
- `@guardian-sdk/sdk` made public and declared as a peer dependency in chain packages to prevent duplicate bundling

**`@guardian-sdk/bsc`** — defensive narrowing for widened types

- Added `GasFee` type guard in `validateSignArgs()` and `buildBaseTransaction()` to safely narrow the widened `Fee` union
