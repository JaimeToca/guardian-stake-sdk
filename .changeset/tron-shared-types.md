---
"@guardian-sdk/sdk": minor
"@guardian-sdk/bsc": patch
"@guardian-sdk/tron": minor
---

Add Tron chain type, Vote transaction, Frozen delegation status, ResourceFee, and assertValidator guard. Make `ClaimDelegateTransaction.validator`/`.index` and `ClaimRewardsTransaction.validator` optional (still required at runtime by BSC/Cardano via `assertValidator`; ignored by Tron), and add the `INVALID_RESOURCE`/`INVALID_VALIDATOR` error codes. Release `@guardian-sdk/tron` as a normal (non-alpha) package.
