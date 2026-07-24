# Security Research & Remediation — Design

**Date:** 2026-07-24
**Repo:** guardian-sdk (pnpm monorepo — `sdk`, `bsc`, `cardano`, `tron`, `solana`)
**Deliverable of this effort:** a grounded security findings report plus a phased remediation plan. Breaking changes are flagged per-case and approved before landing.

## Goal

Reduce real, runtime-reachable security risk across all five packages — dependency/supply-chain and source code — sequence the 10 open Dependabot PRs, and identify any breaking changes the fixes force.

## Non-goals (out of scope)

- Chasing dev-tooling-only vulnerabilities beyond easy patches (esbuild/vite/tsup/tsx, semantic-release, typedoc chains).
- A formal third-party security audit or runtime penetration testing against live RPC endpoints.
- Feature work or refactors unrelated to a security finding.

## Research findings (baseline, 2026-07-24)

`pnpm audit`: **61 vulnerabilities (24 high, 34 moderate, 3 low)**. Risk is concentrated, not uniform:

| Cluster | Runtime-reachable | Notes |
|---|---|---|
| tron → tronweb 6.1.0 → **axios (<1.15.1)**, `validator`, `ws` | Yes — highest concern | ~11 axios advisories: prototype pollution, full MITM, credential theft, ReDoS, DoS. Pinned transitively by `tronweb`. **No open PR fixes this.** |
| sdk → **axios 1.16.0** (direct dep) | Yes | form-data CRLF injection, proxy-inheritance. Fixed by bump to 1.18.1. |
| cardano / tron → **ws** | Yes (if WS RPC used) | Memory-exhaustion DoS. |
| esbuild / vite / brace-expansion / js-yaml / linkify-it | No — dev tooling only | Shipped to no consumer; lower priority. |

**Open PRs (10, all Dependabot):**
- Axios (redundant): #66 (1.17.0), #69 (1.18.1), #75 (1.18.0), #76 (1.18.0) — keep **#69**, close the rest.
- #65 viem 2.48.8 → 2.52.2 — bsc **peer** dep; needs API-compat check.
- Dev-only: #56 TS 6.0.2→6.0.3, #46 eslint group, #45 typedoc.
- CI actions (majors): #68 checkout 4→7, #74 setup-node 4→7.

**Source-code attack surface (audit targets):** `sdk/entity/private-key.ts`; per-chain `sign-service.ts` (bsc/cardano/tron/solana); tx-builders; seed/key derivation (`solana/state/seed.ts`, `cardano/keys/derive-keys.ts`). Not yet deep-audited.

**SECURITY.md is stale:** supported-versions table lists only `sdk` and `bsc`; missing `cardano`, `tron`, `solana`.

## Approach: layered remediation

Fix known-exploitable dependency risk fast, run the deep source audit while easy wins are already merged, then remediate findings and harden CI. Chosen over audit-everything-first (delays fixing known transitive vulns) and deps-only (source audit explicitly wanted).

### Phase 0 — Quick wins (non-breaking, no source risk)
- Adopt axios **#69 (1.18.1)** in `packages/sdk`; close #66/#75/#76 as superseded.
- After CI green, merge dev-only bumps: #56, #45, #46.
- Verify workflows still run, then merge CI action majors #68/#74.

### Phase 1 — Supply-chain hardening
- Add pnpm `overrides` forcing `axios@^1.18.1` (and patched `ws`, `validator`) repo-wide to fix the tron/tronweb transitive chain. **Verify tronweb 6.1.0 still functions against a FullNode.** If incompatible → escalate a `tronweb` major bump as a breaking-change candidate.
- viem #65: check bsc usage for API drift before advancing the accepted peer range.
- Re-run `pnpm audit`; target **zero runtime-reachable high/critical**. Document dev-only residuals as accepted risk.

### Phase 2 — Formal source audit (read-only, all 5 packages)
- Run `security-auditor` subagent per package (Opus for fund-safety-critical ones). Focus:
  - Key material lifetime — `private-key.ts`: never logged, not retained, not leaked into error messages.
  - Signing flows — sign/prehash/compile: signature↔tx binding correct, `signArgs` threading safe, no key material in thrown errors.
  - Tx construction — amount/address validation, BSC native-token rejection intact, no `isMaxAmount` bypass where disallowed.
  - RPC/network — input validation, response parsing (json-bigint precision), no SSRF via caller-controlled URLs.
  - Type safety — `any`/unsafe casts around untrusted input.
- Consolidate into one severity-ranked report with `file:line`.

### Phase 3 — Remediate findings + CI hardening
- Fix confirmed source findings; breaking ones go to the register for per-case approval.
- Add CI `pnpm audit --audit-level high` gate; evaluate CodeQL/Semgrep + secret scanning.
- Update `SECURITY.md` supported-versions table (add cardano/tron/solana).

## Breaking-change register (live)

| Candidate | Trigger | Status |
|---|---|---|
| `tronweb` major bump | Only if the axios `overrides` fix is incompatible with tronweb 6.1.0 | Flagged — decide per-case |

All other planned changes are non-breaking to consumers.

## Success criteria

- Zero runtime-reachable high/critical vulnerabilities.
- Every source-audit finding resolved or explicitly accepted with rationale.
- All 10 open PRs triaged into a merge order (redundant ones closed).
- CI audit gate live.
- `SECURITY.md` accurate for all five packages.
