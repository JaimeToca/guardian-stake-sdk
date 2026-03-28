# Contributing to Guardian SDK

> **Legal notice:** By submitting a contribution you agree that it will be licensed under the project's [MIT License](./LICENSE) and that you have the right to grant that license. Contributions are accepted as-is with no implied obligation to merge, maintain, or support them. See the full disclaimer in [README.md](./README.md#disclaimer) before using or contributing to this project.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to contribute](#how-to-contribute)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Commit conventions](#commit-conventions)
- [Pull request process](#pull-request-process)
- [Adding a new chain package](#adding-a-new-chain-package)
- [Release process](#release-process)

---

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree to uphold it.

---

## How to contribute

| What | Where |
|------|-------|
| Bug report | [Open a bug issue](.github/ISSUE_TEMPLATE/bug_report.md) |
| Feature request | [Open a feature request](.github/ISSUE_TEMPLATE/feature_request.md) |
| Security vulnerability | See [SECURITY.md](./SECURITY.md) — **do not open a public issue** |
| Question / discussion | Open a GitHub Discussion |

---

## Development setup

**Prerequisites**: Node.js ≥ 18, npm ≥ 9.

```bash
# Clone and install
git clone https://github.com/JaimeToca/bnb-native-staking.git
cd bnb-native-staking
npm install

# Build (sdk must build before bsc)
npm run build

# Type-check all packages
npm run typecheck

# Run tests
npm test

# Lint + format check
npm run lint
npm run format:check
```

All CI checks must pass before a PR is merged:

1. `format:check` — Prettier
2. `lint` — ESLint
3. `typecheck` — TypeScript
4. `test` — Vitest
5. `build` — tsc

---

## Project structure

```
packages/
  sdk/   → @guardian/sdk  — chain-agnostic core, no viem
  bsc/   → @guardian/bsc  — BNB Smart Chain implementation
examples/ → runnable usage examples
docs/     → generated TypeDoc site (not committed)
```

See [CLAUDE.md](./CLAUDE.md) for a detailed architecture walkthrough.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/). Every commit on `main` triggers an automated release via `semantic-release`.

```
<type>(<scope>): <short summary>

Types:  feat | fix | perf | refactor | docs | test | chore | ci | build
Scope:  sdk | bsc | deps | release  (optional but recommended)

Examples:
  feat(bsc): add claimable balance to BalanceService
  fix(sdk): correct ConfigError message for unknown chain
  docs: update BSC README with slashing details
  chore(deps): bump viem to 2.48.0
```

- `feat` → bumps **minor** version
- `fix` / `perf` → bumps **patch** version
- `BREAKING CHANGE:` footer or `!` after type → bumps **major** version
- All other types → no release

---

## Pull request process

1. Fork the repo and create a branch: `git checkout -b feat/my-feature`
2. Make your changes following the conventions above.
3. Run the full check suite locally (`npm run build && npm run typecheck && npm test && npm run lint`).
4. Open a PR against `main` with a clear description of **what** and **why**.
5. A maintainer will review. Address any feedback and keep commits clean.
6. Once approved and CI passes, a maintainer merges — semantic-release handles the version bump and npm publish automatically.

**By opening a pull request you confirm that:**
- You have the right to submit the contribution under the MIT License.
- Your contribution does not introduce malicious code, backdoors, or intentional vulnerabilities.
- You understand that the maintainers may reject any contribution at their sole discretion without explanation.
- You understand that this project is unaudited software provided as-is, and your contribution will be subject to the same disclaimer.

---

## Adding a new chain package

The full contributor guide lives at **[`docs/adding-a-chain.md`](./docs/adding-a-chain.md)**. It covers every required step: package structure, service contracts, CI requirements, testing strategy, sample code, and documentation standards.

### Quick start

Use the scaffold script to generate the complete package skeleton in one command (Python 3.8+ required):

```bash
# EVM chain
python3 scripts/scaffold_chain.py ethereum --symbol ETH --chain-id 1 --explorer https://etherscan.io

# Non-EVM chain
python3 scripts/scaffold_chain.py tron --symbol TRX --chain-id 728126428 --no-viem
```

The script creates `packages/<chain>/` with all source files, configs, and test stubs, and patches `eslint.config.mjs` and the root `package.json` automatically. After running it, search for `TODO` in the generated files — those are the only places requiring chain-specific logic.

> **Note:** New chain implementations must include their own disclaimer that the implementation is unaudited and experimental until a formal security review has been completed.

---

## Release process

Releases are fully automated via `semantic-release` on every push to `main`. Do **not** manually bump versions or write changelog entries — just follow the commit convention.

The release workflow:
1. Analyzes commits since the last release tag.
2. Determines the next version (major/minor/patch).
3. Updates `CHANGELOG.md`.
4. Publishes both packages to npm.
5. Creates a GitHub release with release notes.
