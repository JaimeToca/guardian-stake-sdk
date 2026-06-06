# Run Sample

Runs a chain sample against the live network using `tsx` with the `examples/tsconfig.json`.

## Input

`/run-sample [bsc|cardano]`

If no chain is given, ask: "Which sample — `bsc` or `cardano`?"

## File mapping

| Chain | File |
|---|---|
| `bsc` | `examples/bnb-native-staking-sample.ts` |
| `cardano` | `examples/cardano-native-staking-sample.ts` |

## Steps

1. Determine the chain from the argument. If missing, ask before proceeding.

2. **For `cardano`**: check that `CARDANO_API_KEY` is set in the environment (`echo $CARDANO_API_KEY`). If empty, tell the user: "Set `CARDANO_API_KEY` to your Blockfrost mainnet project ID and re-run." Do not proceed.

3. Run:
   ```
   npx tsx --tsconfig examples/tsconfig.json examples/<file>
   ```
   Timeout: 30 seconds.

4. Report results:
   - What calls succeeded (balances, validators, delegations) and key values returned (validator count, balance amounts).
   - Any errors — show the message and diagnose the likely cause (network, missing env var, type error).

## Notes

- Both samples auto-call `sample_check_delegations()` at the bottom — that is the only function that runs. It is read-only (no signing or broadcasting).
- Write functions (`sample_delegate_transaction`, etc.) require a funded wallet. Do not call them unless the user explicitly asks.
- If `tsx` is not found, run `pnpm add -D tsx` first and retry.
