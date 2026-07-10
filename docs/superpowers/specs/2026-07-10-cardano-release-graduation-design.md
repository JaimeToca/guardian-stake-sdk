# Graduating `@guardian-sdk/cardano` from alpha to stable `1.0.0`

**Date:** 2026-07-10
**Status:** Approved (pending spec review)

## Goal

Stop treating `@guardian-sdk/cardano` as a parked, manually-released alpha package.
Promote it to a normal, non-prerelease package that versions and publishes
automatically via `changesets` on merge to `main`, on the `latest` dist-tag —
exactly like `@guardian-sdk/bsc`. First stable version: **`1.0.0`**.

## Background / current state

- `@guardian-sdk/cardano` is in the `ignore` array of `.changeset/config.json`, so it
  never participates in automated versioning/publishing.
- It is pinned at `1.0.0-alpha.0` and published under the `alpha` dist-tag
  (`publishConfig.tag: "alpha"`).
- Releasing it today is a manual ritual: remove it from `ignore`, copy
  `docs/cardano-release-draft.md` into a changeset, publish, delete the draft. The
  draft has already drifted from the code (its `estimateFee` description predates the
  faithful-fee work).
- The **active** CI release pipeline is `changesets` (`release.yml` runs
  `changesets/action` → `pnpm run publish` → `changeset publish`). A separate
  `release.config.mjs` (semantic-release) and some docs (`CONTRIBUTING.md`) still
  describe semantic-release; this is a pre-existing inconsistency, **out of scope**
  here (flagged, not fixed).

## Chosen approach: A — hand-set `1.0.0` + seed the changelog

Directly set the version and dist-tag, remove the package from `ignore`, and convert
the existing release draft into a real `CHANGELOG.md`. Predictable single publish;
no reliance on changesets bumping from a prerelease base (which is unreliable without
formal pre-mode). After this change, Cardano behaves like every other package: each
change requires a changeset, and merges to `main` auto-version and auto-publish it.

Options B (changeset-driven bump from the alpha base) and C (formal changesets
pre-enter/exit) were rejected: B is fragile from a prerelease base; C is ceremony for
*ongoing* prereleases, which we are leaving entirely.

## Changes

### 1. Release configuration (mechanical)

- **`.changeset/config.json`** — `"ignore": ["@guardian-sdk/cardano"]` → `"ignore": []`.
- **`packages/cardano/package.json`**
  - `"version": "1.0.0-alpha.0"` → `"version": "1.0.0"`.
  - Remove `publishConfig.tag: "alpha"` (defaults to `latest`); keep
    `publishConfig.access: "public"`.

### 2. Changelog

- Create **`packages/cardano/CHANGELOG.md`** with a `## 1.0.0` entry seeded from
  `docs/cardano-release-draft.md`, **refreshed for accuracy**. Specifically, the
  `estimateFee()` bullet must be rewritten to describe the current faithful-fee
  behavior: it fetches the on-chain registration status + reward balance and builds a
  mock that mirrors the signed tx (distinct payment/staking witnesses, TTL, real
  certificate set, full-balance withdrawal) plus a 10% buffer; a base address is
  required. All other bullets carried over as-is (verified still accurate).
- Delete **`docs/cardano-release-draft.md`**.

### 3. Documentation & guardrails (remove alpha markers)

- **`CLAUDE.md`** (Project State, ~line 85) — rewrite the "Cardano is alpha" bullet:
  Cardano is now a stable package released via `changesets` alongside `sdk`/`bsc`;
  remove the `ignore`/manual-draft instructions.
- **`.claude/rules/sdk.md`** (~line 13) — remove the "Changeset `ignore` trap" note
  (no package is ignored anymore, so the trap no longer exists).
- **`README.md`** (~line 76) — package table: "Available (alpha)" → "Available".
- **`packages/cardano/README.md`**
  - Lines 7–8: **remove the `⚠️ Alpha release — not production-ready / do not use
    with real funds` banner entirely** (present 1.0.0 as a normal stable package).
  - Lines ~309–322: install instructions drop the `@alpha` suffix →
    `npm install @guardian-sdk/cardano` (and peers), remove the "published under the
    alpha dist-tag" sentence.

### 4. Release flow after this change (behavior, no code)

- Every Cardano change now requires a changeset (like `bsc`).
- On merge to `main`, `changesets/action` opens/updates the "Version Packages" PR for
  any pending changesets; merging that PR triggers `changeset publish`, which pushes
  `@guardian-sdk/cardano` to the `latest` dist-tag.
- First publish: `cardano@1.0.0` → `latest` (the version is not yet on npm under
  `latest`, so `changeset publish` will publish it even without a pending changeset).

## Verification

- `pnpm run build && pnpm run typecheck && pnpm run test && pnpm run lint && pnpm run format:check` all pass.
- `npx changeset status` runs cleanly (no "ignored package in changeset" error, since
  `ignore` is now empty).
- Grep confirms no remaining `alpha` / `@alpha` / "ignore … cardano" references in
  tracked config or user-facing docs (test fixtures like the mock validator named
  "Alpha" are unrelated and left alone).
- Manual read: `packages/cardano/CHANGELOG.md` 1.0.0 entry matches current behavior.

## Out of scope / related (tracked separately, not part of this change)

- **`sdk` changeset:** commit `e04afa0` changed `packages/sdk/src/rpc/rpc-utils.ts`
  and needs its own `patch` changeset regardless — required for the branch to release
  cleanly, but independent of Cardano graduation.
- **Uncommitted preHash README diagram fix** — separate doc commit.
- **semantic-release vs changesets inconsistency** (`release.config.mjs`,
  `CONTRIBUTING.md`) — pre-existing; flagged for a future cleanup.
- **Fee-ceiling defense-in-depth cap** from the security review — optional, unrelated.
