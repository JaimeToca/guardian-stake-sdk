# Add Chain

Scaffolds a new Guardian SDK chain package and guides implementation until all services are complete, typechecked, and tested.

## Input

`/add-chain <slug> [--symbol SYM] [--chain-id N] [--explorer URL] [--no-viem]`

Examples:
- `/add-chain ethereum --symbol ETH --chain-id 1 --explorer https://etherscan.io`
- `/add-chain tron --symbol TRX --chain-id 728126428 --no-viem`

If no `slug` is given, ask for it before proceeding.

---

## Phase 1 — Scaffold

### 1. Validate the slug
Must be lowercase kebab-case (e.g. `ethereum`, `bnb-smart-chain`). Reject if `packages/<slug>` already exists.

### 2. Run the scaffold script
```
python scripts/scaffold_chain.py <slug> [--symbol SYM] [--chain-id N] [--explorer URL] [--no-viem]
```
Show the list of created files.

### 3. Install dependencies
```
pnpm install
```

### 4. Verify the scaffold compiles
```
pnpm --filter @guardian-sdk/<slug> run typecheck
pnpm --filter @guardian-sdk/<slug> run test
```
Both must pass before moving to Phase 2. The scaffold stubs all methods with `"not yet implemented"` — this is expected.

---

## Phase 2 — Implement Services

Implement the 5 core services in order. Each service must:
- Use a factory function `createXxxService(deps)` — **no classes**
- Accept a `Logger` (or `NoopLogger`) through config — **no `console.log`**
- Use `unknown` + type narrowing for RPC responses — **no `any`**
- Use `bigint` for all on-chain amounts — **no `number` for token values**

### Service 1 — `createStakingService`
- `getValidators(params?)` — paginated list of validators/pools with APY, status, delegator count
- `getDelegations(address)` — active delegations + staking summary for the given address
- Cache validators if the RPC is slow (follow the 3-minute pattern from BSC)
- For EVM chains: use viem multicall for batched contract reads

### Service 2 — `createBalanceService`
- `getBalances(address)` — return all balance types relevant to this chain:
  - `Available` — spendable balance
  - `Staked` — actively delegated amount
  - `Pending` — unbonding (if the chain has an unbonding period)
  - `Claimable` — post-unbonding, ready to withdraw (EVM chains only)
  - `Rewards` — accumulated rewards in a separate account (Cardano only)
- Amounts always in the chain's smallest unit (lovelaces for Cardano, wei for EVM)

### Service 3 — `createFeeService`
- `estimateFee(transaction)` — return a typed `Fee` object
  - EVM chains: simulate the transaction via viem, return a `GasFee`
  - UTxO chains: compute from protocol params + tx size, return a `UtxoFee`
- Must handle all transaction types the chain supports (`Delegate`, `Undelegate`, `Redelegate`, `ClaimRewards`)

### Service 4 — `createSignService`
Implement both signing paths:

**Direct path** — `sign({ privateKey, ... })`
1. Fetch: nonce/UTxOs, protocol params, latest block
2. Build the transaction body
3. Sign with the private key
4. Return the signed transaction hex

**MPC path** — `prehash({ publicKey, ... })` → external signer → `compile({ signature, ... })`
1. `prehash`: build the tx body, return `{ serializedTransaction: bodyHash, signArgs: { ..., _txBodyCbor } }`  — embed the serialized body to prevent mismatch at compile time
2. `compile`: reconstruct the body from `_txBodyCbor`, attach the external signature, return the signed hex

### Service 5 — `getNonce` + `broadcast`
- `getNonce(address)` — fetch account nonce (always `0` for UTxO chains)
- `broadcast(rawTx)` — submit signed transaction hex, return the tx hash

---

## Phase 3 — Wire and Verify

### Wire the factory
In `packages/<slug>/src/<slug>-chain/index.ts`, compose all services and return a plain `GuardianServiceContract` object:
```typescript
export function <slug>(config: <Slug>Config): GuardianServiceContract {
  const rpcClient = create<Slug>RpcClient(config);
  return {
    getChainInfo: () => <slug>Mainnet,
    getValidators: (params) => staking.getValidators(params),
    getDelegations: (address) => staking.getDelegations(address),
    getBalances: (address) => balance.getBalances(address),
    getNonce: (address) => getNonce(address, rpcClient),
    estimateFee: (tx) => fee.estimateFee(tx),
    sign: (args) => sign.sign(args),
    prehash: (args) => sign.prehash(args),
    compile: (args) => sign.compile(args),
    broadcast: (rawTx) => broadcast(rawTx, rpcClient),
  };
}
```

### Run quality gates — all must pass
```
pnpm --filter @guardian-sdk/<slug> run typecheck
pnpm --filter @guardian-sdk/<slug> run test
pnpm run lint
pnpm run format:check
```

### Final checklist
- [ ] No `class` keyword anywhere in the package
- [ ] No `viem` import inside `packages/sdk` or a non-EVM chain package
- [ ] No `@cardano-sdk/*` import outside `packages/cardano`
- [ ] No `any` types
- [ ] No `console.log` — logger injected via config
- [ ] All amounts use `bigint`
- [ ] `BalanceType` used correctly (`"Claimable"` for EVM post-unbonding, `"Rewards"` for Cardano)
- [ ] `.claude/rules/<slug>.md` created with chain-specific architecture notes
- [ ] Package added to the packages table in `README.md`

---

## Notes

- The scaffold patches `eslint.config.mjs` and the root `package.json` build script automatically.
- Pass `--no-viem` for non-EVM chains (UTxO-based, no account model).
- Never add the new package to `.changeset/config.json` `ignore` unless it is intentionally pre-release.
- Do not add `viem` or `@cardano-sdk/*` to a new package unless it targets those ecosystems.
