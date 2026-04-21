---
"@guardian-sdk/cardano": minor
"@guardian-sdk/sdk": minor
"@guardian-sdk/bsc": patch
---

**`@guardian-sdk/cardano`** — initial release of Cardano native staking support

- `cardano()` factory wires all services and returns a `GuardianServiceContract`
- `getValidators()` returns top 20 stake pools by live stake with estimated APY (10 min cache)
- `getDelegations()` fetches the delegated pool directly — pools outside the top 20 are always indexed
- `getBalances()` reports `Available` (controlled ADA), `Staked` (same as Available — nothing is locked), and `Rewards` (withdrawable rewards) balances
- `estimateFee()` uses iterative fee estimation — feeds the fee back into tx construction up to 3 passes until convergence, ensuring accuracy when a larger fee forces an extra UTXO or changes the CBOR size
- `sign()` builds and signs `Delegate` / `Redelegate` / `Undelegate` / `ClaimRewards` transactions using `paymentPrivateKey` + `stakingPrivateKey`
- `broadcast()` submits signed CBOR hex to Blockfrost `/tx/submit`
- `Undelegate` transactions include an automatic reward sweep — the stake deregistration certificate requires all pending rewards to be withdrawn in the same transaction; the SDK fetches `withdrawable_amount` and adds the withdrawal field automatically
- Blockfrost error handling maps only genuine `404`s to `null`; pools with no registered metadata are detected via an empty object response (`200 {}`) rather than a `404`; all other errors are rethrown
- Mainnet network validation on all address inputs — testnet addresses (`addr_test1...`) are rejected with `INVALID_ADDRESS`
- `@cardano-sdk/core`, `@cardano-sdk/crypto`, `@cardano-sdk/util`, and `@guardian-sdk/sdk` are peer dependencies — not bundled, reused if already present in the consumer project

**`@guardian-sdk/sdk`** — extensions to support Cardano and balance type improvements

- `GuardianChainType` and `ChainEcosystemType` extended with `"Cardano"`
- `UtxoFee` added to the `Fee` union
- `Validator.delegators` widened to `number | undefined`
- `StakingSummary.activeValidators` and `totalValidators` widened to `number | undefined`
- `GuardianServiceContract.sign()` and `GuardianSDK.sign()` widened to `BaseSignArgs`
- `@guardian-sdk/sdk` made public and declared as a peer dependency in chain packages to prevent duplicate bundling
- `RewardsBalance` added to the `Balance` union (`type: "Rewards"`) — lifetime rewards earned, for display purposes; supported by Cardano
- `ClaimableBalance` description updated — represents funds that completed the unbonding period and require an explicit claim transaction; on chains with no unbonding period (Cardano) this maps to accumulated rewards in the reward account
- Balance type JSDoc updated with cross-chain explanations and `Supported by` annotations per type

**`@guardian-sdk/bsc`** — defensive narrowing for widened types

- Added `GasFee` type guard in `validateSignArgs()` and `buildBaseTransaction()` to safely narrow the widened `Fee` union
