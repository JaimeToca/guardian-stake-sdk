# Doc Drift

Checks that the API surface documented in package READMEs matches the actual TypeScript types. Reports mismatches with file and line references so they can be fixed immediately.

## Input

`/doc-drift [bsc|cardano|all]`

Default: `all` — checks both packages.

## What to check

For each target package, compare the README against the source types. Focus on things that silently diverge — interface field names and types, union string literals, method signatures, and error code tables.

### 1. Interface shapes

Extract every `interface` and `type` block from the README's TypeScript code fences. For each one, find the corresponding definition in source and compare field by field.

Key types to check:

| README type | Source file |
|---|---|
| `Validator` | `packages/sdk/src/entity/staking-types.ts` |
| `Delegation` | `packages/sdk/src/entity/staking-types.ts` |
| `StakingSummary` | `packages/sdk/src/entity/staking-types.ts` |
| `ValidatorsPage` / `pagination` shape | `packages/sdk/src/entity/staking-types.ts` |
| `BalanceType` | `packages/sdk/src/entity/balance-types.ts` |
| `Balance` subtypes | `packages/sdk/src/entity/balance-types.ts` |
| `DelegationStatus` | `packages/sdk/src/entity/staking-types.ts` |
| `ValidatorStatus` | `packages/sdk/src/entity/staking-types.ts` |
| `GasFee` (BSC) | `packages/bsc/src/...` |
| `UtxoFee` (Cardano) | `packages/cardano/src/...` |

### 2. Example output comments

Look for `// TypeName  value` style comment blocks in code examples. The type name printed must match the actual string literal in `BalanceType`, `DelegationStatus`, etc.

Examples of what to catch:
- A comment showing `// Claimable  2.1 ADA` when the code returns `"Rewards"`
- A comment showing `// Active` when `DelegationStatus` has no `"Active"` variant

### 3. Error code tables

Find the error code tables in each README (the `| Code | Thrown when |` tables under `ValidationError`, `ConfigError`, `SigningError`). Compare the codes listed against the actual `ErrorCode` type in `packages/sdk/src/`.

### 4. Method signatures

Check method signatures documented in the API Reference against the `GuardianServiceContract` in `packages/sdk/src/service/guardian-service-contract.ts`. Look for:
- Missing methods (documented but not on the contract)
- Extra methods (on the contract but not documented)
- Wrong return types (`Promise<Validator[]>` vs `Promise<ValidatorsPage>`)
- Wrong parameter types

### 5. Package-specific exports

For each package's README Installation / Dependencies section, verify:
- Listed peer dependencies match `peerDependencies` in `package.json`
- Listed versions match exactly
- `@alpha` / dist-tag instructions are accurate for packages in alpha

## How to run the check

1. Read the target README(s).
2. Read the relevant source files listed above.
3. For each category above, compare systematically.
4. Report findings as a table:

| Location | README says | Source says | Severity |
|---|---|---|---|
| `packages/cardano/README.md:549` | `// Claimable` | `"Rewards"` | Fix |
| ... | ... | ... | ... |

Severity levels:
- **Fix** — factually wrong, will confuse consumers
- **Stale** — was correct but source moved
- **Missing** — documented but not exported / exported but not documented

5. For each **Fix** or **Stale** item, apply the correction immediately unless the user says otherwise.

## Notes

- Do not flag prose descriptions — only check typed interfaces, code examples, and tables.
- README code blocks that use `// TODO` or marked as pseudocode are not checked.
- Run this skill before any release to catch documentation regressions introduced since the last check.
