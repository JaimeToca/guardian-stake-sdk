# Security Research & Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate runtime-reachable dependency vulnerabilities, audit the fund-safety source surface across all five packages, triage the 10 open Dependabot PRs, and land CI hardening — flagging any breaking change for per-case approval.

**Architecture:** Layered remediation. Phase 0 lands non-breaking quick wins (consolidate axios PRs, dev-tooling bumps). Phase 1 hardens the supply chain via pnpm `overrides` (the tron/tronweb→axios chain is the top risk). Phase 2 runs read-only `security-auditor` subagents per package and consolidates findings. Phase 3 remediates confirmed findings and adds a CI audit gate + accurate `SECURITY.md`.

**Tech Stack:** pnpm 10.33 workspaces, Node ≥22, TypeScript strict, vitest, viem (bsc), tronweb (tron), @cardano-sdk/* (cardano), @solana/kit (solana), axios (sdk), GitHub Actions + Dependabot.

## Global Constraints

- Package manager: `pnpm@10.33.0`; Node `>=22`. Always `pnpm install --frozen-lockfile` in CI; local dep changes update the lockfile and require committing `pnpm-lock.yaml`.
- Build order is fixed: `sdk` → `bsc` → `cardano` → `tron` → `solana`. Never reorder.
- No `class` keyword, no `any`, no cross-package leaks (no viem/@cardano-sdk in `packages/sdk`; no viem in `packages/cardano`).
- `@cardano-sdk/*` are exact-pinned (`0.46.12`, `0.4.5`, `0.17.1`) — do not range-widen; changing them requires immediate `pnpm install`.
- Verification gates for every task that touches deps or code: `pnpm run build && pnpm run typecheck && pnpm run test` must pass.
- Commits happen only with the user's go-ahead (standing no-auto-commit preference); the commit steps below are the exact commands to run once cleared.
- Breaking changes are never landed silently — log them in the Breaking-Change Register in the spec and get per-case approval first.

---

## File Structure

- `package.json` (root) — add `pnpm.overrides` for transitive vuln fixes; the audit gate is wired here indirectly via CI.
- `packages/sdk/package.json` — axios `1.16.0` → `1.18.1`.
- `.github/workflows/ci.yml` — add a `pnpm audit` gate step.
- `SECURITY.md` — supported-versions table for all five packages.
- `docs/superpowers/findings/2026-07-24-source-audit.md` (Create) — consolidated Phase 2 report.
- No source `.ts` files are pre-listed for change: Phase 3 edits are determined by Phase 2 findings and appended as tasks then.

---

## Phase 0 — Quick wins (non-breaking)

### Task 1: Consolidate the axios direct-dependency bump

**Files:**
- Modify: `packages/sdk/package.json` (dependencies.axios)
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Produces: `packages/sdk` resolving `axios@1.18.1`; baseline for the Phase 1 override.

- [ ] **Step 1: Capture the baseline audit count**

Run: `pnpm audit --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);m=d.get('metadata',{}).get('vulnerabilities',{});print(m)"`
Expected: prints a dict like `{'info':0,'low':3,'moderate':34,'high':24,'critical':0}`. Record it.

- [ ] **Step 2: Bump the direct axios dependency**

Edit `packages/sdk/package.json`, set `"axios": "1.18.1"` in `dependencies` (was `1.16.0`).

- [ ] **Step 3: Update the lockfile**

Run: `pnpm install`
Expected: lockfile updates; `packages/sdk` now resolves axios 1.18.1. No peer-dep errors.

- [ ] **Step 4: Verify the sdk axios advisories are gone**

Run: `pnpm audit --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print([a['module_name']+':'+a['title'][:40] for a in d.get('advisories',{}).values() if 'packages__sdk' in ' '.join(p for f in a.get('findings',[]) for p in f.get('paths',[]))])"`
Expected: no axios entries attributed to `packages__sdk` (the form-data/proxy advisories via sdk are cleared).

- [ ] **Step 5: Build + typecheck + test**

Run: `pnpm run build && pnpm run typecheck && pnpm run test`
Expected: all pass (axios 1.16→1.18 is non-breaking for the sdk HTTP client).

- [ ] **Step 6: Commit (on user go-ahead)**

```bash
git add packages/sdk/package.json pnpm-lock.yaml
git commit -m "chore(deps)(sdk): bump axios to 1.18.1 (security)"
```

### Task 2: Close the superseded axios PRs and rebase-note the tracker

**Files:** none (GitHub PR operations only)

- [ ] **Step 1: Close the three superseded axios PRs**

Run:
```bash
for n in 66 75 76; do gh pr close $n --comment "Superseded by axios 1.18.1 landed directly in packages/sdk (see remediation plan Task 1)."; done
```
Expected: PRs #66, #75, #76 closed. (#69 targeted 1.18.1 and is now redundant too — close it as well if Task 1 landed the same version):
```bash
gh pr close 69 --comment "Applied directly in Task 1 (axios 1.18.1)."
```

- [ ] **Step 2: Verify remaining open PRs**

Run: `gh pr list --state open --limit 50`
Expected: axios PRs gone; remaining are #65 (viem), #56 (TS), #46 (eslint), #45 (typedoc), #68 (checkout), #74 (setup-node).

### Task 3: Merge dev-only tooling bumps

**Files:** none locally (merge Dependabot PRs after CI green)

**Interfaces:**
- Consumes: green CI on each PR.

- [ ] **Step 1: Confirm each dev-tooling PR is green and non-breaking**

Run: `for n in 56 45 46; do echo "PR #$n:"; gh pr checks $n; done`
Expected: checks passing. These are dev-only (`typescript` patch 6.0.2→6.0.3, `typedoc` 0.28.18→0.28.19, `eslint` group) — no runtime impact.

- [ ] **Step 2: Merge them**

Run: `for n in 56 45 46; do gh pr merge $n --squash --delete-branch; done`
Expected: merged. If a merge conflicts on `pnpm-lock.yaml` after Task 1, comment `@dependabot rebase` and re-run once green.

- [ ] **Step 3: Sync local main and reinstall**

Run: `git fetch origin && git rebase origin/main && pnpm install --frozen-lockfile`
Expected: clean; lockfile matches.

### Task 4: Triage and merge the CI action major bumps

**Files:** none locally (Dependabot PRs #68, #74)

- [ ] **Step 1: Inspect the diffs**

Run: `gh pr diff 68 && gh pr diff 74`
Expected: `actions/checkout@v4→v7` and `actions/setup-node@v4→v7` in `.github/workflows/*.yml`. Confirm no `node-version`/`cache` option was removed.

- [ ] **Step 2: Confirm CI passes on each**

Run: `gh pr checks 68 && gh pr checks 74`
Expected: green (the workflows still run install/build/test with the new action majors).

- [ ] **Step 3: Merge**

Run: `gh pr merge 68 --squash --delete-branch && gh pr merge 74 --squash --delete-branch`
Expected: merged. Sync local: `git fetch origin && git rebase origin/main`.

---

## Phase 1 — Supply-chain hardening

### Task 5: Override transitive vulnerable deps (axios, form-data, ws, validator)

**Files:**
- Modify: `package.json` (root — add `pnpm.overrides`)
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: baseline audit from Task 1 Step 1.
- Produces: repo-wide patched resolutions for all four committed overrides, including `axios` under `tronweb`.

- [ ] **Step 1: Add all four pnpm overrides**

Edit root `package.json`, inside the existing `"pnpm"` object add (keep `publicHoistPattern` and `confirmModulesPurge`):
```json
"overrides": {
  "axios@<1.18.1": "^1.18.1",
  "form-data@<4.0.6": "^4.0.6",
  "ws@<8.21.0": "^8.21.1",
  "validator@<13.15.22": "^13.15.35"
}
```

- [ ] **Step 2: Reinstall and confirm each override resolves**

Run: `pnpm install`
Expected: install succeeds. Then verify:
- `pnpm why axios` — every axios instance (including `tronweb > axios`) resolves to ≥1.18.1
- `pnpm why form-data` — every instance resolves to ≥4.0.6
- `pnpm why ws` — every instance resolves to ≥8.21.0
- `pnpm why validator` — every instance resolves to ≥13.15.22

- [ ] **Step 3: Verify tronweb (axios consumer) still builds and its tests pass**

Run: `pnpm --filter @guardian-sdk/tron run build && pnpm --filter @guardian-sdk/tron run test`
Expected: PASS. tronweb 6.1.0's axios usage is standard request/response — 1.18.x is API-compatible. **If build/test fails on an axios API change → STOP: log "tronweb major bump" in the Breaking-Change Register and get approval before proceeding (do not silently widen tronweb).**

- [ ] **Step 4: Compatibility check for form-data / ws / validator consumers**

Run: `pnpm run build && pnpm run test`
Expected: PASS across packages. These overrides patch transitive CVEs without intentional public API changes; if a consumer package breaks on a patched minor, log it in the Breaking-Change Register rather than dropping the override.

- [ ] **Step 5: Confirm high/critical residual set**

Run: `pnpm audit --prod --audit-level high --json 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print(sorted({a['module_name'] for a in d.get('advisories',{}).values() if a['severity'] in ('high','critical')}))"`
Expected: empty list for runtime-reachable high/critical after the four overrides (dev-only residuals are accepted under the runtime-only audit policy).

- [ ] **Step 5: Full verification**

Run: `pnpm run build && pnpm run typecheck && pnpm run test`
Expected: all pass.

- [ ] **Step 6: Commit (on user go-ahead)**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): override transitive axios/ws to patched versions (security)"
```

### Task 6: Triage the viem peer bump (#65)

**Files:** possibly `packages/bsc/package.json` (peer/dev range), `pnpm-lock.yaml`

- [ ] **Step 1: List bsc's viem surface**

Run: `grep -rEn "from \"viem" packages/bsc/src | sort -u`
Expected: the exact viem imports bsc depends on (PublicClient, multicall, parseEther, etc.). Record them.

- [ ] **Step 2: Test bsc against the proposed viem version locally**

Run: `pnpm --filter @guardian-sdk/bsc add -D viem@2.52.2 && pnpm --filter @guardian-sdk/bsc run build && pnpm --filter @guardian-sdk/bsc run typecheck && pnpm --filter @guardian-sdk/bsc run test`
Expected: PASS. viem 2.48→2.52 is a minor bump; the multicall/PublicClient APIs bsc uses are stable.

- [ ] **Step 3: Decide the peer range**

If green: keep the `"viem": "2"` peer range (already covers 2.52) and merge #65 for the devDependency bump via `gh pr merge 65 --squash --delete-branch`. If any typecheck breaks → log the specific API drift in the Breaking-Change Register and get approval before touching the peer range.

- [ ] **Step 4: Reinstall and verify**

Run: `git fetch origin && git rebase origin/main && pnpm install --frozen-lockfile && pnpm run build && pnpm run test`
Expected: all pass.

### Task 7: Establish the post-remediation audit baseline

**Files:** none

- [ ] **Step 1: Assert zero runtime-reachable high/critical**

Run:
```bash
pnpm audit --audit-level high --json 2>/dev/null | python3 -c "
import json,sys
d=json.load(sys.stdin)
runtime=[]
for a in d.get('advisories',{}).values():
    if a['severity'] not in ('high','critical'): continue
    tops={p.split('>')[0] for f in a.get('findings',[]) for p in f.get('paths',[])}
    # dev-only tooling roots we accept:
    dev={'.'}
    reachable=tops - dev
    if reachable: runtime.append((a['module_name'],sorted(reachable)))
print('runtime-reachable high/critical:',runtime)
"
```
Expected: `runtime-reachable high/critical: []`. Any remaining entry must be justified as dev-tooling-only or escalated.

- [ ] **Step 2: Record accepted dev-only residuals**

Note in the findings doc (Task 9) which remaining moderate/dev-only advisories are accepted and why (esbuild/vite/tsup/tsx, semantic-release chain, typedoc chain — none shipped to consumers).

---

## Phase 2 — Formal source audit (read-only)

### Task 8: Run the per-package security audits

**Files:** none modified (read-only audit). Findings feed Task 9.

**Interfaces:**
- Produces: five raw audit reports (one per package) with severity + `file:line`.

- [ ] **Step 1: Audit the fund-safety-critical packages (Opus)**

Dispatch the `security-auditor` subagent (Opus) once per package for `sdk`, `bsc`, `cardano`, `tron`, `solana`. Give each this scope prompt:

> Read-only security audit of `packages/<pkg>`. Focus, in priority order: (1) key material — is the private key logged, retained, or leaked into error messages/stack traces? (`packages/sdk/src/entity/private-key.ts` and each `sign-service.ts`); (2) signing flows — sign/prehash/compile: is the signature bound to the exact tx that was prehashed, is `signArgs`/`_rawTx`/`_txBodyCbor`/`_messageBytes` threading tamper-safe, does any thrown error embed key material? (3) tx construction — amount/address validation, BSC native-token rejection intact, no disallowed `isMaxAmount` path, no integer/bigint precision loss; (4) RPC/network — SSRF via caller-controlled `rpcUrl`/`baseUrl`, response parsing (json-bigint), unbounded responses; (5) type safety — `any`/unsafe casts around untrusted input. Report each finding as: severity (Critical/High/Medium/Low/Info), `file:line`, impact, and recommended fix. Do NOT modify files.

Expected: five structured reports returned.

- [ ] **Step 2: Sanity-check the private-key handling finding surface**

Run: `grep -rEn "console\.|logger\.(info|debug|warn|error)\(" packages/*/src --include="*.ts" | grep -iE "key|sign|secret|seed|privat" | grep -viE "test"`
Expected: empty or only non-sensitive matches. Any hit that logs key-adjacent data is a High finding to confirm in the report.

### Task 9: Consolidate findings into one ranked report

**Files:**
- Create: `docs/superpowers/findings/2026-07-24-source-audit.md`

- [ ] **Step 1: Write the consolidated report**

Merge the five subagent reports into `docs/superpowers/findings/2026-07-24-source-audit.md`, sorted Critical→Info. Each row: `package | file:line | severity | one-line impact | recommended fix | breaking? (Y/N)`. Include the Phase 1 dependency outcome and the accepted dev-only residuals from Task 7 Step 2.

- [ ] **Step 2: Extract the Phase 3 task list**

At the bottom of the report, list each Confirmed finding as a proposed remediation task (file, fix, breaking flag). Breaking ones are added to the spec's Breaking-Change Register for per-case approval.

- [ ] **Step 3: Commit the report (on user go-ahead)**

```bash
git add docs/superpowers/findings/2026-07-24-source-audit.md
git commit -m "docs(security): consolidated source-audit findings 2026-07-24"
```

---

## Phase 3 — Remediate findings + CI hardening

### Task 10: Remediate confirmed source findings

**Files:** determined by Task 9 (appended here as concrete sub-tasks before execution).

**Interfaces:**
- Consumes: the Confirmed findings list from Task 9 Step 2.

- [ ] **Step 1: Turn each Confirmed finding into a TDD sub-task**

For every Confirmed finding, append a task with: exact `file:line`, a failing vitest test that reproduces the issue (real fixture, hardcoded expected value — use the `test-and-samples-runner` pattern), the minimal fix, and the passing-test verification. Non-breaking fixes proceed; breaking fixes wait for register approval.

- [ ] **Step 2: Gate**

Do not mark Task 10 complete until every Confirmed finding is either fixed (with a regression test) or explicitly accepted with written rationale in the findings doc.

### Task 11: Add the CI dependency-audit gate

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: Add the audit step**

In `.github/workflows/ci.yml`, after the `Install dependencies` step, insert:
```yaml
      - name: Security audit (runtime deps, high+)
        run: pnpm audit --prod --audit-level high
```

This is intentionally **runtime-only** (`--prod`): high/critical advisories confined to dev/build tooling (vitest/vite, typedoc, eslint, etc.) are accepted residuals and must not fail CI. Document that posture in `SECURITY.md`.

- [ ] **Step 2: Verify it passes locally with current tree**

Run: `pnpm audit --prod --audit-level high; echo "exit=$?"`
Expected: `exit=0` after Phase 1 (no runtime-reachable high/critical). Optionally run full-tree `pnpm audit --audit-level high` to inventory accepted dev-only residuals; those must not be the CI gate.

- [ ] **Step 3: Commit (on user go-ahead)**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add pnpm audit gate for high+ vulnerabilities"
```

### Task 12: Evaluate static analysis + secret scanning (spike)

**Files:** possibly `.github/workflows/codeql.yml` (Create)

- [ ] **Step 1: Decide CodeQL vs Semgrep**

Assess adding GitHub CodeQL (native, free for public repos, JS/TS pack) vs Semgrep. For this SDK, enable CodeQL default setup via repo Security settings OR add a `.github/workflows/codeql.yml` with the `javascript-typescript` language. Recommend CodeQL default setup (zero-maintenance).

- [ ] **Step 2: Enable secret scanning + push protection**

Run (from a clone of the target repo; `{owner}`/`{repo}` are filled by `gh` from git remote): `gh api "repos/{owner}/{repo}" -X PATCH -f security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}'` (or via repo Settings → Code security). Confirm enabled: `gh api "repos/{owner}/{repo}" --jq '.security_and_analysis'`.

- [ ] **Step 3: Record the decision**

Note in the findings doc which tools were enabled and any deferred.

### Task 13: Correct SECURITY.md

**Files:**
- Modify: `SECURITY.md`

- [ ] **Step 1: Update the supported-versions table**

Replace the two-row table (only `sdk`, `bsc`) with all five packages:
```markdown
| Package | Supported |
|---------|-----------|
| `@guardian-sdk/sdk` | latest ✅ |
| `@guardian-sdk/bsc` | latest ✅ |
| `@guardian-sdk/cardano` | latest ✅ |
| `@guardian-sdk/tron` | latest ✅ |
| `@guardian-sdk/solana` | latest ✅ |
```

- [ ] **Step 2: Note the audit posture**

Add a line under the disclaimer stating the repo runs a `pnpm audit` high-gate in CI and (if enabled in Task 12) CodeQL + secret scanning.

- [ ] **Step 3: Commit (on user go-ahead)**

```bash
git add SECURITY.md
git commit -m "docs(security): list all packages + audit posture in SECURITY.md"
```

---

## Self-Review

**Spec coverage:** Phase 0 (PR triage/quick wins) → Tasks 1–4; Phase 1 (supply-chain, tron/axios, viem, baseline) → Tasks 5–7; Phase 2 (per-package audit + report) → Tasks 8–9; Phase 3 (remediate + CI gate + SECURITY.md) → Tasks 10–13. Breaking-Change Register referenced in Tasks 5, 6, 9, 10. Success criteria (zero runtime high/critical, findings resolved/accepted, PRs triaged, CI gate, SECURITY.md accurate) all mapped. No gaps.

**Placeholder scan:** Task 10 is intentionally a meta-task (its concrete sub-tasks are generated from Task 9 findings, which don't exist until the audit runs) — this is a dependency, not a placeholder; the mechanism to fill it is explicit. All dep-bump versions, commands, and expected outputs are concrete.

**Type consistency:** No new types introduced; dependency versions (axios 1.18.1, viem 2.52.2) are consistent across tasks. Override key `axios@<1.18.1` matches the 1.18.1 direct bump.
