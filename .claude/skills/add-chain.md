# Add Chain

Scaffolds a new Guardian SDK chain package, then verifies it typechecks and tests pass.

## Input

`/add-chain <slug> [--symbol SYM] [--chain-id N] [--explorer URL] [--no-viem]`

Examples:
- `/add-chain ethereum --symbol ETH --chain-id 1 --explorer https://etherscan.io`
- `/add-chain tron --symbol TRX --chain-id 728126428 --no-viem`

If no `slug` is given, ask for it before proceeding.

## Steps

1. **Validate the slug** — must be lowercase kebab-case (e.g. `ethereum`, `bnb-smart-chain`). Reject if `packages/<slug>` already exists.

2. **Run the scaffold script**:
   ```
   python scripts/scaffold_chain.py <slug> [--symbol SYM] [--chain-id N] [--explorer URL] [--no-viem]
   ```
   Show the list of created files.

3. **Install dependencies** so the new workspace package is linked:
   ```
   pnpm install
   ```

4. **Typecheck** the new package:
   ```
   pnpm --filter @guardian-sdk/<slug> run typecheck
   ```

5. **Run tests**:
   ```
   pnpm --filter @guardian-sdk/<slug> run test
   ```

6. **Report results**:
   - Pass/fail for typecheck and tests.
   - List the TODOs that remain from the scaffold (services not yet implemented, chain metadata to fill in).
   - Remind the user of the next steps from `docs/adding-a-chain.md`:
     - Fill in service TODOs in `packages/<slug>/src/<slug>-chain/services/`
     - Update `src/chain/index.ts` (type, ecosystem, chainId, decimals)
     - Create `.claude/rules/<slug>.md` with chain-specific architecture notes
     - Add the package to the packages table in `README.md`

## Notes

- The scaffold patches `eslint.config.mjs` and the root `package.json` build script automatically.
- For non-EVM chains (no account model, UTXO-based, etc.) pass `--no-viem` to omit the viem peer dependency.
- The generated services all throw `"not yet implemented"` — typecheck and tests pass on the scaffold because tests are stubs (`it.todo`).
