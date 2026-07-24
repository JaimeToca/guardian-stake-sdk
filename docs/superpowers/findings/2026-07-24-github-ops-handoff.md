# GitHub Operations Handoff — Security Remediation (2026-07-24)

These are outward-facing / hard-to-reverse actions. Per this run's decision, **you execute these yourself**; the subagents only do local code/dep work. Run them in order. Recommended merge order is top-to-bottom.

## 1. Close superseded axios PRs (after Task 1's local axios 1.18.1 lands)

The direct axios bump is applied in the branch (Task 1). These four Dependabot PRs are now redundant:

```bash
for n in 66 75 76; do gh pr close $n --comment "Superseded by axios 1.18.1 landed directly in packages/sdk (security remediation)."; done
gh pr close 69 --comment "Applied directly in-branch (axios 1.18.1)."
```

Verify: `gh pr list --state open --limit 50` → axios PRs gone; remaining: #65, #56, #46, #45, #68, #74.

## 2. Merge dev-only tooling bumps (non-breaking, no runtime impact)

Confirm each is green first:

```bash
for n in 56 45 46; do echo "PR #$n:"; gh pr checks $n; done
```

Then merge (recommended order — smallest blast radius first):

```bash
gh pr merge 56 --squash --delete-branch   # typescript 6.0.2 -> 6.0.3 (patch)
gh pr merge 45 --squash --delete-branch   # typedoc 0.28.18 -> 0.28.19
gh pr merge 46 --squash --delete-branch   # eslint group
```

If any conflicts on `pnpm-lock.yaml` after the in-branch axios change, comment `@dependabot rebase` and re-merge once green.

## 3. Merge CI action major bumps (verify workflows still run)

```bash
gh pr diff 68 && gh pr diff 74          # confirm only checkout@v4->v7 / setup-node@v4->v7, no lost options
gh pr checks 68 && gh pr checks 74      # green?
gh pr merge 68 --squash --delete-branch # actions/checkout 4 -> 7
gh pr merge 74 --squash --delete-branch # actions/setup-node 4 -> 7
```

## 4. viem #65 (2.48.8 -> 2.52.2) — merge ONLY after the local compat check passes

Task 6 (local, run by a subagent) tests `packages/bsc` against viem 2.52.2. **Merge this only if that task reports green:**

```bash
gh pr checks 65
gh pr merge 65 --squash --delete-branch
```

If Task 6 reports API drift, this goes to the Breaking-Change Register instead — do NOT merge until resolved.

## 5. Repo security settings (Task 12) — enable after CI audit gate is in place

Secret scanning + push protection:

```bash
gh api repos/:owner/:repo -X PATCH \
  -f security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}'
gh api repos/:owner/:repo --jq '.security_and_analysis'   # confirm enabled
```

CodeQL: recommended to enable **default setup** via GitHub UI → Settings → Code security → CodeQL analysis → Set up → Default (language: JavaScript/TypeScript). Zero-maintenance; no workflow file to keep. (Advanced setup / `.github/workflows/codeql.yml` only if you need custom queries.)

---

**Note:** None of the above is required for the local branch work to proceed. The subagents will complete all code/dependency/audit/file changes and commit them locally on `JaimeToca/Security-Research`; you merge the Dependabot PRs and flip repo settings at your convenience.
