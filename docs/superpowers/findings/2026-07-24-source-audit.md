# Consolidated Source Audit — guardian-sdk monorepo (2026-07-24)

Consolidates five per-package read-only security audits (`packages/sdk`, `packages/bsc`, `packages/cardano`, `packages/tron`, `packages/solana`) into one ranked findings document. Source reports: `.superpowers/sdd/audit/audit-{sdk,bsc,cardano,tron,solana}.md`. No files were modified by any audit; this document performs no new analysis beyond synthesis — severities are preserved verbatim from each auditor.

---

## 1. Summary

**Total findings by severity (across all five packages, systemic High counted once with 4 sub-instances; Medium/Low/Informational counted as literal Section 3 table rows):**

| Severity | Count | Breakdown |
|---|---|---|
| Critical | 0 | — |
| High | 1 systemic (4 instances) | bsc, cardano, tron, solana — each package's own `compile()` |
| Medium | 13 | sdk 1, bsc 3, cardano 2, tron 3, solana 4 |
| Low | 16 | sdk 3, bsc 4, cardano 3, tron 3, solana 3 |
| Informational | 23 | sdk 5, bsc 3, cardano 5, tron 7, solana 3 |

Per-package row counts from the Section 3 table (C/H-instances/M/L/I): sdk (0/0/1/3/5), bsc (0/1/3/4/3), cardano (0/1/2/3/5), tron (0/1/3/3/7), solana (0/1/4/3/3). Note: each chain package independently reported a High for the same underlying `compile()`-signature-verification defect — this document treats that class as **one systemic finding (SEC-SIGN-1)** with a sub-row per package, so it is *not* double-counted in the executive High total above. SSRF (M-SDK-1 / M-TRON-1 / L-SOLANA-1) remains listed at each auditor's severity in Section 3; when scoring "Maybe" breakages in Section 4 it is counted once.

**Executive summary.** The single most important cross-cutting finding is **systemic and appears in all four chain packages**: `compile()` in `bsc`, `cardano`, `tron`, and `solana` assembles an externally-supplied signature onto a reconstructed/threaded transaction **without cryptographically verifying that signature against the exact digest returned by `prehash()`**, and without confirming that the threaded prehash state (`signArgs` fields — BSC's rebuilt-from-`signArgs.transaction`, Cardano's `_txBodyCbor`, Tron's `_rawTx`, Solana's `_wireTransaction`/`_messageBytes`) was not mutated between the two calls. Every auditor independently flagged this as High (bsc, tron, solana) or High/downgraded-from-Critical (cardano, HIGH-1/HIGH-2). In every package the fallback backstop is the same: the destination chain node rejects a tx whose signature doesn't recover to/verify against its own body, so none of the four instances is rated a direct fund-loss path today — but none of them gives an MPC/policy-engine integrator the "the bytes you signed are the bytes broadcast" guarantee the `prehash`/`compile` contract implies, and BSC's variant is worse in one respect: `compile()` there doesn't reuse prehash bytes at all, it **rebuilds** the tx from mutable `signArgs` and can call live RPC (`bnbToShares`) again, so even an honest caller's Undelegate/Redelegate share count can legitimately drift between prehash and compile. Beyond this systemic issue, the packages are otherwise sound on fund-safety: key material handling is clean everywhere (no key logging, no persistence, no key-adjacent error content), destructive amount/`isMaxAmount` rules are enforced at construction time, and the one Medium common to `sdk`/`bsc`/`tron`/`solana` is an SSRF surface in `validateRpcUrl` (no host/private-range restriction) that only matters if a consumer forwards an untrusted `rpcUrl`. No Critical findings were raised by any auditor.

---

## 2. Dependency remediation outcome (Phase 0/1 — context, not new findings)

From `.superpowers/sdd/progress.md`:

- **Task 1**: `axios` (sdk) bumped `1.16.0 → 1.18.1` — cleared 9 sdk-side axios advisories.
- **Task 5**: `pnpm.overrides` added for `axios` / `form-data` / `ws` / `validator` — high/critical advisory count dropped **21 → 6** (remaining 6 all dev-only). `tronweb` was deliberately **not** bumped (135/135 tests green at pinned version).
- **Task 6**: `bsc` `viem` devDependency bumped `^2.48.8 → ^2.52.2`; the **peer range was left untouched**; no source change; 491 tests green.
- **Task 7 (verification)**: confirmed **zero runtime-reachable** high/critical advisories. Baseline moved **high 24 / moderate 34 → high 7 / moderate 7**.

**Accepted dev-only residuals** (none shipped to consumers, all confined to build/CI tooling):
- `vite` ← `vitest`
- `linkify-it` ← `typedoc` / `markdown-it`
- `brace-expansion` ← `@typescript-eslint`
- `js-yaml` ← `@changesets/cli`
- (per-package audits additionally note `esbuild` ← `tsup`/`tsx`, and `ip-address` ← `@cardano-sdk/core`, both dev/transitive and non-runtime for the published packages)

This phase is complete; no further action proposed here.

---

## 3. Findings table

Sorted Critical → High → Medium → Low → Informational. `breaking?` is provisional — see Section 4 for full reasoning.

| ID | package | file:line | severity | one-line impact | recommended fix | breaking? |
|---|---|---|---|---|---|---|
| SEC-SIGN-1a | bsc | `packages/bsc/src/smartchain/services/sign-service.ts:209-247` | High | `compile()` rebuilds the unsigned tx from mutable `signArgs` (not the exact prehash bytes) and never verifies the signature recovers to the expected signer; Undelegate/Redelegate additionally re-runs live RPC (`bnbToShares`) so even honest callers can compile a different share count than was reviewed at prehash | Thread the exact serialized unsigned tx (or its keccak hash) out of `prehash()` into `signArgs`; `compile()` must reuse those bytes verbatim (mirror Cardano `_txBodyCbor` / Tron `_rawTx`); before assembling, `recoverAddress(bodyHash, signature)` and assert it equals the expected account; never re-run `bnbToShares()`/live RPC inside `compile()` | Maybe (behavioral) |
| SEC-SIGN-1b | cardano | `packages/cardano/src/cardano-chain/services/sign-service.ts:431-524`; `tx/tx-builder.ts:64-89` | High (HIGH-1, HIGH-2 collapse into this if HIGH-1 fixed) | `compile()` assembles `paymentSigHex`/`stakingSigHex` into the witness set; `buildSignedTransaction()` only calls `tx.isValid()` (structural/ledger-rule check) — it never verifies either Ed25519 signature against `body.hash()`; `_txBodyCbor` integrity is only implicitly trusted | Before `buildSignedTransaction`, verify each signature via `@cardano-sdk/crypto` (`Ed25519PublicKey.fromHex(vkeyHex).verify(...)` over `body.hash()`) for both payment and staking witnesses; throw `SigningError("INVALID_SIGNING_ARGS", ...)` on failure | Maybe (behavioral) |
| SEC-SIGN-1c | tron | `packages/tron/src/tron-chain/services/sign-service.ts:81-98` (compile), `:64-78` (prehash threading `_rawTx`) | High (H1) | `compile()` reattaches `args.signature` to `signArgs._rawTx` with no check that the signature is a valid secp256k1 sig over `rawTx.txID`, and no check that `txID` actually equals `SHA256(raw_data)` of the tx about to be broadcast | Recompute `SHA256(raw_data)` and assert equality with `rawTx.txID` before assembling; recover/verify the secp256k1 signature against `txID` (or confirm recovered address equals `owner_address`); throw `SigningError` on mismatch | Maybe (behavioral) |
| SEC-SIGN-1d | solana | `packages/solana/src/solana-chain/services/sign-service.ts:200-235` (compile), `:79-104` (attachFeePayerSignature), `:184-197` (prehash) | High (H-1) | `compile()` ignores the threaded `_messageBytes` entirely, rebuilds solely from `_wireTransaction`, and attaches the caller-supplied 64-byte signature to the fee-payer slot with no Ed25519 verification against the message bytes and no cross-check that `_wireTransaction`'s message equals `_messageBytes` | In `compile()`: recompute the message from `_wireTransaction` and assert equality with `_messageBytes` (constant-time compare); verify the supplied signature against the fee-payer pubkey over the message bytes via Kit's `verifySignature`; reject on either failure | Maybe (behavioral) |
| M-SDK-1 | sdk | `packages/sdk/src/entity/config-validation.ts:12-26` | Medium | `validateRpcUrl` only checks protocol (http/https/ws/wss), no host restriction — permits loopback/link-local/cloud-metadata hosts; combined with axios's default `maxRedirects: 5` in `fetchOrError`, even an allowed host can 3xx-redirect into an internal one | Document `rpcUrl` as trusted-operator-only; optionally add opt-in guard rejecting loopback/private/link-local hosts; set `maxRedirects: 0` in `fetchOrError` | N |
| M-BSC-1 | bsc | `packages/bsc/src/smartchain/services/fee-service.ts:55-78` | Medium (M-1) | `gasPrice`/`gasLimit` trusted verbatim from RPC with no sanity ceiling/floor — a hostile/buggy RPC can massively over-price a tx (fund loss via excess fee) or under-estimate gas (out-of-gas failure) | Validate `gasPrice`/`gasLimit` against configurable sane bounds; document that fee output is only as trustworthy as the RPC | N |
| M-BSC-2 | bsc | `packages/bsc/src/smartchain/services/staking-service.ts:130-146`; `staking-rpc-client.ts:62-82` | Medium (M-2) | RPC-reported pending-unbond count feeds an unbounded `Array.from({length: count})` fan-out of RPC calls (DoS); `unlockTime` cast to `Number()` without bounds check | Clamp pending-unbond count to a sane max before building request array; validate `unlockTime` is a plausible unix-seconds value | N |
| M-BSC-3 | bsc | `packages/bsc/src/smartchain/rpc/staking-rpc-client.ts:26,67,72-73,79-81` | Medium (M-3) | `res.data!` non-null assertions mask empty/short RPC responses, causing low-level viem decode errors instead of typed errors; combined with SEC-SIGN-1a, an empty `getSharesByPooledBNBData` during `compile()` throws mid-signing | Guard `res.data` explicitly; throw typed `ApiError`/`SigningError` with a safe message when missing | N |
| M-CARDANO-1 | cardano | `packages/cardano/src/cardano-chain/rpc/blockfrost-rpc-client.ts:102,118,134` | Medium (MEDIUM-1) | RPC client interpolates addresses directly into URL paths with no defensive validation of its own; currently safe because all live callers pre-validate, but a future caller bypassing `resolveStakeAddress`/`checkIfPaymentAddressIsValid` would allow path/query injection | `encodeURIComponent()` address segments in the RPC client, or assert a strict `^(addr1\\|stake1)[0-9a-z]+$` shape at the top of each RPC method | N |
| M-CARDANO-2 | cardano | `packages/cardano/src/cardano-chain/services/staking-service.ts:64-67,105-122,223,230`; `balance-service.ts:27-28`; `fee-service.ts:103,148` | Medium (MEDIUM-2) | Blockfrost numeric/string fields for APR/reward math and `getDelegations`'s `controlled_amount`/`stake.live` are fed to `Number()`/`BigInt()` without the same non-negative/finite validation used elsewhere (`parseLovelaceString`) — malformed response can throw untyped `SyntaxError` or produce `NaN`/`Infinity` APY | Route every lovelace/count field from Blockfrost through `parseLovelaceString()` (or equivalent) before `BigInt`/`Number`; guard `Number()` results with `Number.isFinite` before use in APY | N |
| M-TRON-1 | tron | `packages/tron/src/tron-chain/index.ts:24` → sdk `config-validation.ts:12-26`; `tron-rpc-client.ts` | Medium (M1) | Same SSRF surface as M-SDK-1, tron-specific instance — `rpcUrl` used verbatim as POST base with no host restriction | Shared-SDK-level fix (allowlist / deny private ranges, or document trust assumption) — same remediation as M-SDK-1 | N |
| M-TRON-2 | tron | `packages/tron/src/tron-chain/rpc/tron-rpc-client.ts:137-149` | Medium (M2, "Medium correctness / Low security") | Broadcast re-parses signed tx JSON with native `JSON.parse` (not the `jsonBig` parser used elsewhere) — large int64 fields could round, though node-side `txID` validation catches divergence and rejects rather than broadcasting a mutated tx | Parse with the same `jsonBig` instance, or pass the already-parsed object through from sign/compile without a round-trip | N |
| M-TRON-3 | tron | `packages/tron/src/tron-chain/services/balance-service.ts:26-31`; `staking-service.ts` `getDelegations`; `fee-service.ts:9-16`; `sign-service.ts:58` | Medium (M3) | Address/account strings checked only for non-emptiness, not base58/hex well-formedness, before use in RPC bodies / as `ownerAddress` — errors surface deep in RPC/TronWeb rather than at the boundary | Validate with `TronWeb.isAddress(...)` (or shared validator) at the service boundary; throw `ValidationError("INVALID_ADDRESS", …)` early | N |
| M-SOLANA-1 | solana | `packages/solana/src/solana-chain/services/sign-service.ts:128-155` | Medium (M-1) | Ed25519 seed `Uint8Array` retained in the `sign()` closure across two `await` boundaries (RPC-bound tx build + signing) with no zeroization afterward — extends key-material lifetime in process memory | Parse the seed as late as possible (right before `signTransaction`); `seed.fill(0)` in a `finally` block once keypair(s) are created | N |
| M-SOLANA-2 | solana | `packages/solana/src/solana-chain/tx/tx-builder.ts:199-249,59` | Medium (M-2) | `sign()` never re-validates caller-supplied `fee.total` against actual funding requirement; Delegate funding gate falls back to a flat `DELEGATE_FEE_CUSHION_LAMPORTS` when `fee.total === 0n`, which under-estimates the real priority fee and can pass a client-side gate on an under-funded wallet | Derive the fee component from `priorityFeeLamports(fee.computeUnits, fee.computeUnitPrice)` plus a base-fee cushion instead of trusting `fee.total`/a flat constant | N |
| M-SOLANA-3 | solana | `packages/solana/src/solana-chain/rpc/solana-rpc-client.ts:159-190` | Medium (M-3) | `getMultipleAccounts` trusts positional correspondence between requested and returned address arrays with no length check — a malformed/malicious RPC response shifting entries could mis-associate account data with the wrong stake account (partially mitigated by downstream authority re-checks) | Assert `value.length === slice.length` per batch; throw `ApiError` on mismatch | N |
| M-SOLANA-4 | solana | `packages/solana/src/solana-chain/state/activation.ts:80-82,152-155` | Medium (M-4) | Cluster-wide `effective`/`activating`/`deactivating` lamport totals (routinely > `Number.MAX_SAFE_INTEGER`) are cast through `Number` for weight computation, losing precision near activation/deactivation boundaries — can mislabel `DelegationStatus`/`BalanceType` (advisory only; withdraw path independently gated on-chain) | Document the float-precision boundary explicitly; clamp derived `effective` to `[0, delegation.stake]` per-position (small, bigint-safe) | N |
| L-SDK-1 | sdk | `packages/sdk/src/rpc/rpc-utils.ts:14-26` | Low (L1) | `fetchOrError` leaves `maxRedirects` at axios default (5); compounds M-SDK-1 | Set `maxRedirects: 0` (or small value) in `fetchOrError`'s default config | N |
| L-SDK-2 | sdk | `packages/sdk/src/entity/private-key.ts:27-54`; `sign-types.ts:11` | Low (L2) | `SigningWithPrivateKey.privateKey` is an unbranded `string`; `privateKey()` validates only secp256k1 — Cardano/Solana Ed25519 seeds bypass shared-layer validation entirely, diffusing validation responsibility across chain packages | Document that `privateKey` is unvalidated at the shared layer; or add an Ed25519-seed validator to the shared entity | N |
| L-SDK-3 | sdk | `packages/sdk/src/entity/private-key.ts:37` | Low (L3) | `BigInt("0x"+stripped)` safety today relies entirely on the anchored `HEX_64_REGEX`; if the regex were ever loosened, `BigInt()` could throw a raw `SyntaxError` instead of a typed `ValidationError` | Keep regex anchored with a comment noting the coupling, or wrap `BigInt()` in try/catch re-throwing `ValidationError` | N |
| L-BSC-1 | bsc | `packages/bsc/src/smartchain/services/broadcast-service.ts:10` | Low (L-1) | `logger.debug` logs the full raw signed transaction — no key material, but enables replay-attempt correlation before confirmation | Log only the tx hash, or a truncated `rawTx` prefix | N |
| L-BSC-2 | bsc | `packages/bsc/src/smartchain/services/sign-service.ts:65` | Low (L-2) | `transaction.validator!` non-null assertion is currently safe (call-order guaranteed by `assertValidator`) but latent null-deref risk if refactored | Use the type narrowed by `assertValidator` instead of `!` | N |
| L-BSC-3 | bsc | `packages/bsc/src/smartchain/validations.ts:12` | Low (L-3) | Error message echoes raw attacker-supplied address string back; minor, thrown not rendered | Optionally truncate/omit raw value in the message | N |
| L-BSC-4 | bsc | `packages/bsc/package.json` (`peerDependencies.viem: "2"`) | Low (L-4) | Unpinned major-range peer dep on a security-sensitive serialization/signing library | Document tested minimum, pin viem exactly in devDependencies/CI; consider narrowing peer range | N |
| L-CARDANO-1 | cardano | `sign-service.ts:280-285,316-326`; `tx-helpers.ts:160-180` | Low (LOW-1) | No lower-bound guard on `fee.total >= 0` before writing into tx body; negative/zero fee passes locally, rejected only at broadcast | Add `if (fee.total <= 0n) throw new ValidationError("INVALID_FEE", ...)` alongside the existing `fee.type` check | N |
| L-CARDANO-2 | cardano | `tx/tx-helpers.ts:69-104`; sign-service.ts (Delegate path) | Low (LOW-2) | `Delegate`/`Redelegate` `transaction.amount` is accepted but silently ignored (Cardano delegates the whole wallet) — no validation, purely UX/clarity surprise | Document loudly at the type boundary, or ignore (no security change required) | N |
| L-CARDANO-3 | cardano | repo-wide `pnpm audit` | Low (LOW-3) | Dev/build-tooling advisories only (7 high/7 moderate/2 low), none in runtime crypto/serialization path | Bump build toolchain when convenient; not release-blocking | N |
| L-TRON-1 | tron | `tx/tx-builder.ts:41,58,64` | Low (L1) | SUN bigint amounts narrowed to `number` for TronWeb calls; guarded by `> Number.MAX_SAFE_INTEGER` check first — safe today | No change required; optionally document the boundary | N |
| L-TRON-2 | tron | `rpc/tron-rpc-client.ts:126` | Low (L2) | `getChainParameters()` forces int64 chain params through `Number()`; only affects fee/APR display magnitude, not signed bytes | Acceptable; optionally clamp fee-relevant params to a sane max | N |
| L-TRON-3 | tron | `rpc/tron-rpc-client.ts:90-95` | Low (L3) | `getAccountResources` reads `NetLimit`/`NetUsed` (capitalized) vs `freeNetLimit`/`freeNetUsed` (camel) — casing mismatch risk silently yields `0n`, only ever over-estimates fee (never under/free) | Confirm field casing against FullNode schema; add test fixture | N |
| L-SOLANA-1 | solana | `solana-chain/index.ts:34` → sdk `config-validation.ts:12-26` | Low (L-1) | Same SSRF surface as M-SDK-1/M-TRON-1, solana-specific instance; rated Low here vs Medium by sdk/tron auditors (see discrepancy note below) | Same as M-SDK-1 | N |
| L-SOLANA-2 | solana | `services/load-positions.ts:147-198`; `tx/tx-builder.ts:67-96` | Low (L-2) | No explicit upper bound on `seedScanMax`; large misconfigured values cause O(seedScanMax) eager address-derivation loop and oversized (though RPC-chunked) account fetch — self-inflicted DoS, not attacker-reachable | Clamp `seedScanMax` to a sane maximum in the factory; derive addresses in batches rather than eagerly | N |
| L-SOLANA-3 | solana | `rpc/solana-rpc-client.ts:59-62` | Low (L-3) | `mapRpcError` attaches raw upstream error (`data: err`) and interpolates `err.message`; if `rpcUrl` carries credentials and a caller logs the thrown error verbatim, secrets could leak into consumer logs | Sanitize/redact before attaching `data`, or omit `data: err` in favor of message-only error | N |
| I-SDK-1..5 | sdk | private-key.ts, errors.ts, rpc-utils.ts, rpc-error.ts, package.json | Informational | Clean key handling; correct secp256k1 range validation; no timing-leak concern; error layer leaks nothing; axios exact-pinned and clean | — | N |
| I-BSC-1..3 | bsc | index.ts / config-validation.ts; pnpm audit; sign-service.ts / abi | Informational | SSRF-by-design note (config-time); all 16 audit advisories dev/build-only; native-token rejection architecturally enforced | — | N |
| I-CARDANO-1..5 | cardano | derive-keys.ts/sign-service.ts; tx-helpers.ts; coin-selection; rpc-utils.ts; sign-types.ts | Informational | Clean key handling; full-balance withdrawal correctly enforced; coin selection bounded/precision-safe; RPC errors leak nothing; type safety sound | — | N |
| I-TRON-1..7 | tron | sign-service.ts; tron-rpc-client.ts; staking-service.ts; tx-builder.ts/validations.ts; package.json | Informational | Clean key handling; json-bigint safe-by-default (proto pollution not reachable); computeApr clamps correctly; broadcast rejection doesn't leak; isMaxAmount/whole-TRX rules enforced; casts narrow; deps exact-pinned and clean | — | N |
| I-SOLANA-1..3 | solana | pnpm audit; rpc-client.ts casts; multiple files (positive controls) | Informational | No Solana-runtime-path advisories; brand casts contained; positive controls verified (isMaxAmount rejection, stakeAccount validation, ClaimDelegate/Undelegate on-chain-state gates, authority binding, Ed25519-only seed usage, no key logging) | — | N |

**Severity discrepancy note**: the `rpcUrl` SSRF-surface finding (no host/private-range restriction in `validateRpcUrl`) is rated **Medium** by the `sdk` auditor (M1) and the `tron` auditor (M1), but **Low** by the `solana` auditor (L-1). The `bsc` auditor rated the same underlying gap **Informational** (I-1). This document does not resolve the discrepancy — it is the same shared-SDK code path (`packages/sdk/src/entity/config-validation.ts:12-26`) and each auditor's severity reflects their own package's exposure judgment; a single fix (Section 5, task grouped under the SDK) addresses all four instances at once regardless of which severity label is used.

---

## 4. Breaking-change assessment

| Finding | Breaking? | Reasoning |
|---|---|---|
| SEC-SIGN-1a (bsc compile) | **Maybe (behavioral)** | Adding a `recoverAddress` check that throws on mismatch is additive for correct callers (a caller whose signature validly recovers to the expected account sees no change). It **would newly reject** any caller currently able to get an unverifiable/mismatched signature through `compile()` silently to broadcast (where today the node is the only backstop) — such a caller was already producing a tx the node would reject, so this closes a previously-silent failure into an explicit local throw. Also behavior-changing: `compile()` no longer re-runs `bnbToShares()`/live RPC, so an Undelegate/Redelegate compiled long after prehash will use the prehash-time share count rather than a fresher on-chain rate — a deliberate, documented behavior change for correctness. |
| SEC-SIGN-1b (cardano compile) | **Maybe (behavioral)** | Same shape: adding Ed25519 verification via `@cardano-sdk/crypto` throws `SigningError` on an invalid/mismatched signature. Honest callers whose signatures are valid over `body.hash()` are unaffected. Any caller relying on `compile()`'s current lack of verification (e.g., a test harness feeding garbage signatures) newly throws where it previously produced an unusable-but-non-throwing CBOR tx. |
| SEC-SIGN-1c (tron compile) | **Maybe (behavioral)** | Adding a `txID == SHA256(raw_data)` check plus signature verification throws `SigningError` on mismatch. Previously-accepted-but-invalid `signArgs`/signature combinations (which the node would reject anyway) now fail locally instead of at broadcast. |
| SEC-SIGN-1d (solana compile) | **Maybe (behavioral)** | Adding a `_wireTransaction` vs `_messageBytes` equality check plus `verifySignature` throws on mismatch. Any caller currently passing a tampered `_wireTransaction` or an invalid/garbage signature (previously accepted and only failing at node broadcast) now throws locally. |
| M-SDK-1 / M-TRON-1 / L-SOLANA-1 (SSRF, `validateRpcUrl`) | **Maybe (behavioral), only if enforced** | Pure documentation of the trust assumption is non-breaking (N). If the optional guard (reject loopback/private/link-local hosts) is implemented as a hard rejection rather than opt-in, any consumer currently pointing `rpcUrl` at a local/private node (e.g. local devnet, private validator, internal test RPC) for legitimate testing would newly throw at factory construction. Recommend shipping as **opt-in** (default off) to keep this "N" — flag as "Maybe" only if made default-on. |
| M-BSC-1 (fee sanity bounds) | N | Adding ceiling/floor validation on `gasPrice`/`gasLimit` only rejects previously-nonsensical RPC responses; normal operation unaffected. |
| M-BSC-2 (unbonding fan-out clamp) | N | Clamping an already-pathological count is additive; normal wallets never hit the clamp. |
| M-BSC-3 (`res.data!` guard) | N | Converts an opaque crash into a typed error; no change to successful-path behavior. |
| M-CARDANO-1 (RPC address encoding) | N | Defense-in-depth only; all live callers already pre-validate. |
| M-CARDANO-2 (Blockfrost numeric validation) | Maybe (behavioral) | A malformed Blockfrost response that previously threw an untyped `SyntaxError` or produced `NaN` now throws a typed `ValidationError` instead — different error shape/type for callers that pattern-match on error class, but not a change to any successful-path return value. |
| M-TRON-2 (jsonBig broadcast parse) | N | Internal parser swap; output identical for all values within safe range, corrects only the (currently improbable) large-int64 edge case. |
| M-TRON-3 (address format validation) | Maybe (behavioral) | A malformed address that previously reached the FullNode/TronWeb and failed there now throws `ValidationError("INVALID_ADDRESS", ...)` earlier and with a different message/code — behavior-additive for well-formed input, but changes the error path for already-invalid input. |
| M-SOLANA-1 (seed zeroization) | N | Internal memory-hygiene change; no observable API/behavior difference. |
| M-SOLANA-2 (fee-vs-funding re-derivation) | Maybe (behavioral) | Deriving the funding-gate fee component from `computeUnits`/`computeUnitPrice` instead of trusting `fee.total`/flat cushion could cause a `Delegate` that previously passed the client-side gate (under a `fee.total: 0n` fallback) to now fail the gate locally with `INSUFFICIENT_FUNDS`-class error before ever reaching broadcast. This is a stricter, more correct pre-flight — flagged Maybe because it changes which calls succeed locally. |
| M-SOLANA-3 (length-check on `getMultipleAccounts`) | N | Only rejects a malformed RPC response shape; normal responses unaffected. |
| M-SOLANA-4 (activation float clamp) | N | Clamping to `[0, delegation.stake]` only corrects out-of-range float artifacts; normal-range values pass through unchanged. |
| All Low findings (L-SDK-1..3, L-BSC-1..4, L-CARDANO-1..3, L-TRON-1..3, L-SOLANA-1..3) | N | Logging changes, defensive casts/guards, documentation, dependency pin bumps — none alter a successful call's return shape or type signature. The one partial exception is **L-CARDANO-1** (fee `<= 0` guard), marked N because a negative/zero fee was never a legitimately-accepted input (it was always going to be rejected on-chain); rejecting it locally instead is non-breaking for any real caller. |
| All Informational findings | N | No code change proposed for most; purely observational. |

**Summary for the Breaking-Change Register**: **0 findings are unconditionally "Y."** **8 findings are "Maybe (behavioral)"**: the 4 systemic `compile()` sub-instances (SEC-SIGN-1a/b/c/d), the SSRF guard *if enforced as default-on* (counted once, spanning M-SDK-1/M-TRON-1/L-SOLANA-1), M-CARDANO-2, M-TRON-3, and M-SOLANA-2. All are additive-for-correct-callers / stricter-for-already-invalid-input changes — none change a successful, valid call's output shape, but each newly throws in a case that previously succeeded silently or failed later/less clearly. Recommend the human treat all 8 as candidates for the Breaking-Change Register with the "Maybe" qualifier, and decide per-instance whether the stricter behavior ships as default-on or opt-in.

---

## 5. Proposed Phase 3 remediation tasks

Ordered by severity, then by cross-cutting theme.

### Theme A — `compile()` signature/integrity verification (systemic, SEC-SIGN-1a–d)

One theme, four package-specific sub-tasks (each crypto primitive differs).

1. **[SEC-SIGN-1a] BSC — bind `compile()` to prehash bytes + verify recovered signer**
   - Files: `packages/bsc/src/smartchain/services/sign-service.ts` (prehash ~L209, compile ~L247), `packages/bsc/src/smartchain/sign-types.ts` (or wherever `PrehashResult.signArgs` is typed).
   - Fix: thread the exact serialized unsigned tx (or its keccak256 body hash) from `prehash()` into `signArgs` (new internal field, mirroring Cardano's `_txBodyCbor`/Tron's `_rawTx`); `compile()` reuses those bytes verbatim instead of calling `buildUnsignedTransaction(...)` again, and never re-invokes `bnbToShares()`/live RPC. After assembling, `recoverAddress(bodyHash, parseSignature(signature))` and throw `SigningError("SIGNATURE_MISMATCH", ...)` if it doesn't equal `transaction.account`.
   - Regression test: unit test that (a) a valid prehash→sign→compile round-trip still produces a broadcastable tx unchanged from today's fixtures; (b) mutating `signArgs.transaction.amount` (or `.validator`) between prehash and compile causes `compile()` to throw rather than silently assembling a divergent tx; (c) a signature from an unrelated tx/account is rejected by `compile()` before any RPC call.
   - Breaking: Maybe (behavioral) — see Section 4.

2. **[SEC-SIGN-1b] Cardano — verify Ed25519 signatures against `body.hash()` in `compile()`**
   - Files: `packages/cardano/src/cardano-chain/services/sign-service.ts` (~L431-524), `packages/cardano/src/cardano-chain/tx/tx-builder.ts` (~L64-89).
   - Fix: before `buildSignedTransaction()`, verify both `paymentSigHex` and `stakingSigHex` via `@cardano-sdk/crypto` (`Ed25519PublicKey.fromHex(vkeyHex).verify(Ed25519SignatureHex(sigHex), HexBlob(body.hash()))`); throw `SigningError("INVALID_SIGNING_ARGS", ...)` on any verification failure. This also closes HIGH-2 (no separate change needed once HIGH-1 is fixed, per the cardano auditor).
   - Regression test: fixture with a valid signed round-trip (unchanged output); a corrupted/truncated `stakingSigHex` must throw `SigningError` locally instead of producing a CBOR tx that only fails at broadcast; a `_txBodyCbor` swapped between prehash/compile with stale signatures must throw.
   - Breaking: Maybe (behavioral).

3. **[SEC-SIGN-1c] Tron — recompute `txID` and verify secp256k1 signature in `compile()`**
   - Files: `packages/tron/src/tron-chain/services/sign-service.ts` (~L81-98 compile, ~L64-78 prehash).
   - Fix: recompute `SHA256(raw_data)` from `rawTx.raw_data`/`raw_data_hex` and assert equality with `rawTx.txID`; recover/verify the secp256k1 signature against `txID` (or assert the recovered address equals `raw_data.contract[].parameter.value.owner_address`); throw `SigningError` on mismatch.
   - Regression test: valid freeze/vote/unfreeze/claim round-trips unchanged; a `_rawTx` with `raw_data` mutated post-prehash (stale `txID`) must throw; a signature from a different owner must throw.
   - Breaking: Maybe (behavioral).

4. **[SEC-SIGN-1d] Solana — cross-check `_wireTransaction` against `_messageBytes` and verify signature in `compile()`**
   - Files: `packages/solana/src/solana-chain/services/sign-service.ts` (~L200-235 compile, ~L79-104 attachFeePayerSignature, ~L184-197 prehash).
   - Fix: in `compile()`, recompute the message from `_wireTransaction` and assert byte-equality (constant-time compare) with `_messageBytes`; verify the supplied 64-byte signature against the fee-payer pubkey over the message bytes via Kit's `verifySignature`; reject on either failure.
   - Regression test: valid Delegate/Undelegate/ClaimDelegate round-trips unchanged; a `_wireTransaction` swapped to a different message post-prehash must throw; a garbage/invalid 64-byte signature must throw before broadcast.
   - Breaking: Maybe (behavioral).

### Theme B — SSRF surface in `validateRpcUrl` (M-SDK-1 / M-TRON-1 / L-SOLANA-1, informational note in bsc I-1)

5. **[M-SDK-1, M-TRON-1, L-SOLANA-1] Shared SDK — document trust assumption + optional private-range guard**
   - File: `packages/sdk/src/entity/config-validation.ts` (~L12-26); optionally `packages/sdk/src/rpc/rpc-utils.ts` (~L14-26, `maxRedirects`).
   - Fix: document in the sdk README/JSDoc that `rpcUrl` must be operator-trusted, never accept it from untrusted end-user input; add an **opt-in** flag (default off, to avoid breaking local/dev RPC usage) that rejects loopback/private/link-local hosts (`127.0.0.0/8`, `::1`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `.local`); set `fetchOrError`'s `maxRedirects: 0` (addresses `L-SDK-1` too) since RPC/JSON endpoints should never redirect.
   - Regression test: existing rpcUrl validation tests unchanged (opt-in flag off by default); new test with the guard enabled rejects `http://169.254.169.254/...` and `http://localhost:8545`; test that `maxRedirects: 0` doesn't break any existing RPC client test fixture that doesn't rely on redirects.
   - Breaking: N by default (opt-in); Maybe if the guard ships default-on.

### Theme C — Fund-safety-adjacent Medium fixes (independent, can parallelize)

6. **[M-BSC-1] BSC — sanity-bound `gasPrice`/`gasLimit` in fee estimation**
   - File: `packages/bsc/src/smartchain/services/fee-service.ts` (~L55-78).
   - Fix: reject/clamp `gasPrice` above a configurable ceiling and floor at network minimum; reject `gasLimit` of 0 or absurdly large.
   - Regression test: fee-service unit test with a mocked RPC returning an outlier `gasPrice`/`gasLimit`; assert clamped/rejected rather than passed through.
   - Breaking: N.

7. **[M-BSC-2] BSC — clamp pending-unbond fan-out and validate `unlockTime`**
   - Files: `packages/bsc/src/smartchain/services/staking-service.ts` (~L130-146), `staking-rpc-client.ts` (~L62-82).
   - Fix: clamp pending-unbond count to a sane max before building the request array; validate `unlockTime` is a plausible unix-seconds value before `* 1000n` conversion.
   - Regression test: mocked RPC returning a huge count; assert bounded RPC fan-out and no `Number` overflow in `pendingUntil`.
   - Breaking: N.

8. **[M-BSC-3] BSC — typed error on empty RPC `call()` result**
   - File: `packages/bsc/src/smartchain/rpc/staking-rpc-client.ts` (L26,67,72-73,79-81).
   - Fix: replace `res.data!` with an explicit guard throwing `ApiError`/`SigningError` on missing data.
   - Regression test: mocked empty (`0x`) RPC response; assert typed error instead of viem decode exception.
   - Breaking: N.

9. **[M-CARDANO-1] Cardano — defensive address encoding in RPC client**
   - File: `packages/cardano/src/cardano-chain/rpc/blockfrost-rpc-client.ts` (L102,118,134).
   - Fix: `encodeURIComponent()` address path segments, or assert `^(addr1|stake1)[0-9a-z]+$` at the top of each RPC method.
   - Regression test: RPC client unit test with a crafted address containing `/`/`?`; assert rejection or safe encoding, not URL injection.
   - Breaking: N.

10. **[M-CARDANO-2] Cardano — validate Blockfrost numeric fields before `BigInt`/`Number`**
    - Files: `packages/cardano/src/cardano-chain/services/staking-service.ts` (L64-67,105-122,223,230), `balance-service.ts` (L27-28), `fee-service.ts` (L103,148).
    - Fix: route lovelace/count fields (including `controlled_amount`, `stake.live`) through `parseLovelaceString()` or equivalent finite/non-negative guard before `BigInt`/`Number`; guard `Number()` results with `Number.isFinite` before APY use.
    - Regression test: mocked Blockfrost response with a non-numeric/scientific-notation string; assert typed `ValidationError` instead of uncaught `SyntaxError`/`NaN` propagation.
    - Breaking: Maybe (behavioral) — see Section 4.

11. **[M-TRON-2] Tron — use `jsonBig` for broadcast re-parse**
    - File: `packages/tron/src/tron-chain/rpc/tron-rpc-client.ts` (L137-149, native `JSON.parse` at L140).
    - Fix: parse the signed tx JSON with the same `jsonBig` instance used elsewhere, or avoid the round-trip entirely by passing the already-parsed object through from sign/compile.
    - Regression test: fixture with an int64 field near `Number.MAX_SAFE_INTEGER`; assert broadcast payload preserves exact precision.
    - Breaking: N.

12. **[M-TRON-3] Tron — validate address format at service boundary**
    - Files: `packages/tron/src/tron-chain/services/balance-service.ts` (L26-31), `staking-service.ts` (`getDelegations`), `fee-service.ts` (L9-16), `sign-service.ts` (L58).
    - Fix: validate with `TronWeb.isAddress(...)` (or a shared validator) before any RPC/TronWeb call; throw `ValidationError("INVALID_ADDRESS", ...)`.
    - Regression test: malformed address input to `getBalances`/`getDelegations`/`sign`; assert early typed rejection instead of a deep RPC/TronWeb failure.
    - Breaking: Maybe (behavioral) — see Section 4.

13. **[M-SOLANA-1] Solana — zeroize Ed25519 seed after use**
    - File: `packages/solana/src/solana-chain/services/sign-service.ts` (L128-155).
    - Fix: parse the seed as late as possible (ideally right before `signTransaction`); `seed.fill(0)` in a `finally` block once keypair(s) are derived.
    - Regression test: unit/property test asserting the seed buffer is zeroed post-sign (inspect the `Uint8Array` reference after the call returns).
    - Breaking: N.

14. **[M-SOLANA-2] Solana — derive Delegate funding gate from real fee components**
    - File: `packages/solana/src/solana-chain/tx/tx-builder.ts` (L199-249, L59).
    - Fix: compute the fee component of the funding gate from `priorityFeeLamports(fee.computeUnits, fee.computeUnitPrice)` plus a base-fee cushion, instead of trusting `fee.total`/a flat `DELEGATE_FEE_CUSHION_LAMPORTS` fallback.
    - Regression test: Delegate with `fee.total: 0n` and a non-default `computeUnitPrice`; assert the funding gate now reflects the real priority fee rather than the flat cushion.
    - Breaking: Maybe (behavioral) — see Section 4.

15. **[M-SOLANA-3] Solana — length-check `getMultipleAccounts` results**
    - File: `packages/solana/src/solana-chain/rpc/solana-rpc-client.ts` (L159-190).
    - Fix: assert `value.length === slice.length` per batch; throw `ApiError` on mismatch.
    - Regression test: mocked RPC returning a shorter/shifted array; assert rejection instead of silent mis-association.
    - Breaking: N.

16. **[M-SOLANA-4] Solana — clamp activation-math float outputs**
    - File: `packages/solana/src/solana-chain/state/activation.ts` (L80-82, L152-155).
    - Fix: document the float-precision boundary; clamp derived per-position `effective` to `[0, delegation.stake]` (bigint-safe, small values).
    - Regression test: cluster-scale (>2^53 lamports) synthetic input; assert per-position `effective` stays within `[0, delegation.stake]`.
    - Breaking: N.

### Theme D — Low-severity cleanup (batch, non-breaking, can be done opportunistically)

17. **[L-SDK-1] Shared SDK** — set `maxRedirects: 0` in `fetchOrError` (folds into Task 5 above if done together).
18. **[L-SDK-2, L-SDK-3] Shared SDK** — document/guard Ed25519-seed validation gap and regex-coupling fragility in `private-key.ts`.
19. **[L-BSC-1] BSC** — log only tx hash (or truncated prefix) in `broadcast-service.ts:10`.
20. **[L-BSC-2] BSC** — replace `transaction.validator!` with the type narrowed by `assertValidator`.
21. **[L-BSC-3] BSC** — truncate/omit raw address value in `validations.ts:12` error message.
22. **[L-BSC-4] BSC** — pin `viem` exactly in devDependencies/CI; document tested minimum for the peer range.
23. **[L-CARDANO-1] Cardano** — add `fee.total <= 0n` guard in `sign()`/`prehash()`.
24. **[L-CARDANO-2] Cardano** — document that `Delegate`/`Redelegate` `amount` is ignored (or leave as-is; optional).
25. **[L-CARDANO-3] Cardano** — bump build toolchain (`esbuild`, `js-yaml`, `brace-expansion`) opportunistically.
26. **[L-TRON-1, L-TRON-2] Tron** — no change required; add documentation comments on the `Number()` boundaries.
27. **[L-TRON-3] Tron** — confirm `NetLimit`/`NetUsed` field casing against FullNode schema; add a test fixture.
28. **[L-SOLANA-2] Solana** — clamp `seedScanMax` to a sane maximum in the factory; batch address derivation instead of eager loop.
29. **[L-SOLANA-3] Solana** — sanitize/redact `data: err` in `mapRpcError`, or omit raw error passthrough.

No fix is proposed for any Informational finding — all are confirmed-clean observations.

---

*This document synthesizes only what the five source audits state. No new code analysis was performed; severities, file:line references, and recommendations are drawn verbatim or paraphrased faithfully from the per-package reports. Where two auditors rated the same underlying issue differently (the `validateRpcUrl` SSRF surface), both ratings are preserved and the discrepancy is called out explicitly rather than resolved.*
