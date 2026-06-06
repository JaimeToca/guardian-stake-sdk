# API Parity

Checks that every chain package fully and correctly implements `GuardianServiceContract`. Catches gaps before they reach consumers.

## Input

`/api-parity`

No arguments — always checks all chain packages.

## The contract

`GuardianServiceContract` is defined in `packages/sdk/src/service/guardian-service-contract.ts`. It requires these 10 methods:

| Method | Signature |
|---|---|
| `getValidators` | `(params?: GetValidatorsParams) => Promise<ValidatorsPage>` |
| `getDelegations` | `(address: string) => Promise<Delegations>` |
| `getBalances` | `(address: string) => Promise<Balance[]>` |
| `getNonce` | `(address: string) => Promise<number>` |
| `estimateFee` | `(transaction: Transaction) => Promise<Fee>` |
| `sign` | `(signingArgs: BaseSignArgs) => Promise<string>` |
| `prehash` | `(preHashArgs: BaseSignArgs) => Promise<PrehashResult>` |
| `compile` | `(compileArgs: CompileArgs) => Promise<string>` |
| `broadcast` | `(rawTx: string) => Promise<string>` |
| `getChainInfo` | `() => GuardianChain` |

## Steps

### 1. Read the contract

Read `packages/sdk/src/service/guardian-service-contract.ts` to get the authoritative list of required methods and their signatures. If the file has changed since this skill was written, use the file as the source of truth — not this list.

### 2. Check each chain factory

For each chain package (`bsc`, `cardano`, and any others in `packages/`):

**a) Find the factory**
- BSC: `packages/bsc/src/smartchain/index.ts`
- Cardano: `packages/cardano/src/cardano-chain/index.ts`
- New chains: `packages/<chain>/src/<chain>-chain/index.ts`

Read the return object of the factory function. It must assign a value for every method in the contract.

**b) Check the return object**

For each of the 10 contract methods:
- Is it present in the return object?
- Does the wired service call match the method signature? (e.g. `getValidators: (params) => staking.getValidators(params)` — params must be forwarded, not dropped)

**c) Check the public index**

Read `packages/<chain>/src/index.ts`. It must:
- `export * from "@guardian-sdk/sdk"` — re-exports all SDK types for consumers
- Export the chain factory function by name (`bsc`, `cardano`, etc.)
- Export `chains`, `SUPPORTED_CHAINS`, `getChainById`, `isSupportedChain`

### 3. Check exported error classes

Read `packages/sdk/src/errors/` to find all error classes (typically `ValidationError`, `ConfigError`, `SigningError`, `GuardianError`).

Each chain's `src/index.ts` must re-export all of them (they come through `export * from "@guardian-sdk/sdk"` — verify the SDK's own index exports them).

Read `packages/sdk/src/index.ts` and confirm all error classes are exported.

### 4. Check `GuardianChain` registration

Each chain must register itself so `GuardianSDK` can route calls. Read the chain's `src/chain/index.ts` and confirm:
- The chain constant (`bscMainnet`, `cardanoMainnet`, etc.) is exported
- `chains`, `SUPPORTED_CHAINS`, `getChainById`, `isSupportedChain` are all exported

### 5. Report findings

Output a table:

| Check | BSC | Cardano | Notes |
|---|---|---|---|
| All 10 contract methods present | ✅ / ❌ | ✅ / ❌ | List any missing |
| Params forwarded correctly | ✅ / ❌ | ✅ / ❌ | |
| `export * from sdk` present | ✅ / ❌ | ✅ / ❌ | |
| Error classes exported via SDK | ✅ / ❌ | ✅ / ❌ | |
| Chain constants exported | ✅ / ❌ | ✅ / ❌ | |

For any ❌, show the specific gap (missing method name, missing export, wrong signature) and the file + line where the fix belongs.

## Notes

- Run this skill whenever `GuardianServiceContract` is modified — a new method in the SDK contract will silently break chain packages that don't implement it (TypeScript catches this at build time, but only if you build).
- This skill does **not** check behavioral correctness — only structural presence. Use tests for behavior.
- New chain packages scaffolded with `scripts/scaffold_chain.py` pass this check on day one (all 10 methods are wired, all exports are present) but all methods throw `"not yet implemented"`. That is expected.
