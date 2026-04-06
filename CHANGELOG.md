# Changelog

> All notable changes to Guardian SDK packages are documented here.
> Versions follow [Semantic Versioning](https://semver.org/).
>
> **Disclaimer:** Guardian SDK is unaudited, experimental software provided AS-IS under the MIT License. No warranties are made regarding correctness, security, or fitness for any purpose. The maintainers are not liable for any loss of funds, data, or damages. Use at your own risk. See [SECURITY.md](./SECURITY.md) and [README.md](./README.md) for the full disclaimer.

<!-- semantic-release will prepend release notes below this line -->

## [0.1.0] — 2026-04-06

Initial release of the Guardian SDK.

### Packages

- **`@guardian/sdk` `0.1.0`** — Chain-agnostic core. No viem dependency.
- **`@guardian/bsc` `0.1.0`** — BNB Smart Chain native staking implementation.

### Features

#### Staking API (`GuardianSDK`)
- `getValidators(chain)` — fetch all validators (active, inactive, jailed) with APY, delegator count, and credit address
- `getDelegations(chain, address)` — fetch all delegations for an address plus a `StakingSummary` (max APY, min stake, unbonding period, redelegate fee)
- `getBalances(chain, address)` — available, staked, pending, and claimable balances in wei
- `getNonce(chain, address)` — current transaction nonce
- `estimateFee(transaction)` — on-chain gas simulation with 15% buffer; returns `gasPrice`, `gasLimit`, and `total`
- `sign(args)` — sign with a raw private key or a viem `PrivateKeyAccount`
- `preHash(args)` / `compile(args)` — two-step MPC/hardware wallet signing flow
- `broadcast(chain, rawTx)` — broadcast a signed transaction and return the tx hash

#### BNB Smart Chain specifics
- Supports `Delegate`, `Undelegate`, `Redelegate`, and `Claim` transaction types
- BNB→share conversion handled internally for `Undelegate` and `Redelegate`
- Legacy (pre-EIP-1559) transaction encoding — compatible with BSC's `StakeHub` system contract
- Validator metadata fetched from BNB Chain's native RPC and merged with on-chain data via multicall

#### Developer experience
- **Logging** — opt-in `ConsoleLogger` with `debug | info | warn | error` levels; bring-your-own via the `Logger` interface
- **Test utilities** (`@guardian/sdk/testing`) — `createMockService`, `mockValidator`, `mockDelegation`, `mockDelegations`, `mockBalance`, `mockFee`, `mockDelegateTransaction`, and more
- **Error types** — `ValidationError`, `ConfigError`, `SigningError`, each with a machine-readable `code` field
- **Node.js ≥ 22**, TypeScript target `ES2024`
