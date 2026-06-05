# @guardian-sdk/sdk

## 0.2.0

### Minor Changes

- b529391: **`@guardian-sdk/sdk`** — extensions to support Cardano and balance type improvements

  > **Action required for existing consumers.** Four type changes below will cause TypeScript compiler errors at the call site. Each fix is a one-line guard or a `default` case — no runtime behaviour changes.

  **Type changes that require call-site updates:**
  - `Validator.delegators` widened to `number | undefined` — add a null guard before using the value:
    ```typescript
    // before
    console.log(validator.delegators.toFixed());
    // after
    console.log(validator.delegators?.toFixed() ?? "—");
    ```
  - `StakingSummary.activeValidators` and `totalValidators` widened to `number | undefined` — same pattern: add a null guard or fallback before use
  - `UtxoFee` added to the `Fee` union — exhaustive switches on `fee.type` must handle the new case or add a `default` branch:
    ```typescript
    switch (fee.type) {
      case "GasFee": ...; break;
      default: break; // handles UtxoFee and any future fee types
    }
    ```
  - `RewardsBalance` added to the `Balance` union — exhaustive switches on `balance.type` must handle `"Rewards"` or add a `default` branch

  **Other additions (no action required):**
  - `GuardianChainType` and `ChainEcosystemType` extended with `"Cardano"`
  - `GuardianServiceContract.sign()` and `GuardianSDK.sign()` widened to `BaseSignArgs`
  - `@guardian-sdk/sdk` made public and declared as a peer dependency in chain packages to prevent duplicate bundling
  - `ClaimableBalance` description updated — represents funds that completed the unbonding period and require an explicit claim transaction; on chains with no unbonding period (Cardano) this maps to accumulated rewards in the reward account
  - Balance type JSDoc updated with cross-chain explanations and `Supported by` annotations per type

  **`@guardian-sdk/bsc`** — defensive narrowing for widened types
  - Added `GasFee` type guard in `validateSignArgs()` and `buildBaseTransaction()` to safely narrow the widened `Fee` union
