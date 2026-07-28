# Browser smoke test

A minimal Vite + React harness that imports all four `@guardian-sdk` chain packages and
exercises each one's most browser-fragile path, to prove they bundle **and run** in a browser.

It isn't part of the published SDK — it's a manual/CI browser-compatibility check and the
source of the polyfill recipes documented in each package's `README.md`
("Browser / frontend usage").

## What each card checks

| Chain | Path exercised | Browser risk it proves |
|---|---|---|
| BSC | construct `bsc()` factory | viem bundles (no polyfills needed) |
| Solana | construct `solana()` factory | no `node:crypto` dependency |
| Tron | construct `tron()` factory | `Buffer` global polyfill works |
| Cardano | `await ready()` + `deriveCardanoKeys` | libsodium WASM init + full polyfill set |

The `vite.config.ts` here is the reference polyfill recipe (Buffer/process/stream/util +
the pnpm shim-alias fix for `vite build`).

## Run it

```bash
pnpm install
pnpm --filter guardian-smoke-test dev      # then open the printed URL and click "Run all"
```

Green on all four cards = the SDK is browser-ready with that config.

## Headless (CI-style) run

`run-headless.mjs` drives the page in system Chrome via `playwright-core`, clicks "Run all",
and prints each card's result plus any console/page errors:

```bash
pnpm --filter guardian-smoke-test dev &     # or `build` + a static server
node run-headless.mjs                        # from the smoke-test/ directory
```
