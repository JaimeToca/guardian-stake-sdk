---
globs: packages/tron/**
---
# Tron

**Service wiring**: `tron()` accepts a `TronConfig` (`rpcUrl`, `logger?`), validates `rpcUrl`, creates a `TronWebFactory` and a thin FullNode RPC client, then composes all services. **FullNode HTTP only — no TronGrid.** `getNonce()` is inlined in the factory and always returns `0` (Tron uses ref-block + expiration, not an account nonce).

**Layer breakdown**:
- `packages/tron/src/tron-chain/index.ts` — `tron()` factory
- `packages/tron/src/chain/index.ts` — `tronMainnet` chain definition and `chains` registry
- `packages/tron/src/tron-chain/services/` — Service factory functions:
  - `createStakingService` — Super Representatives + computed APR (cached), resource-granular `getDelegations`
  - `createBalanceService` — `Available`/`Staked`/`Pending`/`Claimable`/`Rewards`, SUN
  - `createFeeService` — resource-based estimate (`ResourceFee`)
  - `createSignService` — sign / prehash / compile via TronWeb
  - `createBroadcastService` — `POST /wallet/broadcasttransaction`
- `packages/tron/src/tron-chain/rpc/` — `createTronRpcClient` — thin FullNode HTTP client (`getaccount`, `getaccountresource`, `getReward`, `listwitnesses`, `getchainparameters`, `getbrokerage`, `getnowblock`, `broadcasttransaction`)
- `packages/tron/src/tron-chain/tronweb/tronweb-factory.ts` — `createTronWebFactory(fullHost)` — builds and signs via TronWeb's `transactionBuilder`/`trx.sign`
- `packages/tron/src/tron-chain/apr/apr-calculator.ts` — `computeApr(AprInput)` — pure, unit-testable APR formula
- `packages/tron/src/tron-chain/tx/` — Transaction construction:
  - `tx-builder.ts` — `buildUnsignedTx(tronWeb, tx, ownerAddress)` narrows on `tx.type`, calls the matching TronWeb builder
  - `tron-types.ts` — `TronResource`, `TronDelegateTransaction`, `TronUndelegateTransaction`, `SUN_PER_TRX`, `TronSignArgs`, `UnsignedTronTx`
  - `validations.ts` — `assertFreeze`, `assertVote`, `assertUnfreeze`, `availableTronPower`

## The core mental model: freeze → vote → unfreeze → claim

Tron Stake 2.0 splits staking into two **separate, independently-signed actions** — freezing TRX and voting it. This is the single most important thing to understand before touching this package:

```
Freeze (Delegate)      stake TRX for a resource → gain resource + Tron Power   → delegation: Frozen
  │                     (earning the RESOURCE only — NO TRX rewards yet)
Vote (Vote)             allocate Tron Power to a Super Representative           → delegation: Active
  │                     (now earning TRX voting rewards)
Unfreeze (Undelegate)   begin unstaking (partial allowed); 14-day bond starts   → delegation: Pending
  │
(14 days later)                                                                → delegation: Claimable
  ├─ ClaimDelegate      WithdrawExpireUnfreeze → matured principal back to wallet
  └─ ClaimRewards       WithdrawBalance        → voting rewards (24h cooldown), independent of above
```

**Freeze ≠ Vote — freezing alone earns nothing.** This is the single biggest Tron gotcha and the reason `getDelegations` reports a distinct `"Frozen"` status: a user who freezes TRX gets ENERGY or BANDWIDTH and 1:1 Tron Power, but earns **zero TRX rewards** until they submit a separate `Vote` transaction for a Super Representative. A `Frozen` delegation is a standing signal — "you froze this, but you still need to vote to earn TRX." Don't treat `Frozen` as equivalent to `Active`; don't let a UI show APY on a `Frozen` position (its placeholder validator has `apy: 0`).

## Resource model — ENERGY vs BANDWIDTH

Freezing TRX grants one of two resources, chosen by the caller on every `Delegate`/`Undelegate`:
- **BANDWIDTH** — needed for regular transactions (transfers, most contract calls)
- **ENERGY** — needed for smart-contract execution (TRC20 transfers, DApp calls)

**Tron Power is granted 1:1 with frozen TRX regardless of which resource was chosen** — 100 TRX frozen for BANDWIDTH gives exactly the same 100 votes of Tron Power as 100 TRX frozen for ENERGY. `resource` is a **Tron-only field** — it doesn't exist on the shared SDK `DelegateTransaction`/`UndelegateTransaction`; it's added via the `TronDelegateTransaction`/`TronUndelegateTransaction` extensions in `tron-types.ts`, and `tx-builder.ts` casts to read it before calling `freezeBalanceV2`/`unfreezeBalanceV2`.

## Units — SUN

Smallest unit is **SUN**: `1 TRX = 1_000_000 SUN` (`SUN_PER_TRX`, `decimals: 6`). All `amount` fields across this package are SUN bigints. **Vote amounts must be a whole number of TRX** — `tx-builder.ts` and `assertVote` both reject `amount % 1_000_000n !== 0n` before converting to `votes = amount / 1_000_000n` for TronWeb's `vote()` call.

## Balances — five types, no double-counting

`getBalances(address)` reads `getAccount` + `getReward` and returns exactly:

| `BalanceType` | source |
|---|---|
| `Available` | `getAccount.balance` — liquid TRX |
| `Staked` | `Σ frozenV2[].amount` — frozen principal, both resources |
| `Pending` | `Σ unfrozenV2[]` still unbonding (`expireTime` in the future) |
| `Claimable` | `Σ unfrozenV2[]` matured (`expireTime` passed) |
| `Rewards` | `getReward` — unclaimed voting rewards |

`Staked` and the `Pending`/`Claimable` split are mutually exclusive partitions of `frozenV2`/`unfrozenV2` — an amount that has started unfreezing is no longer counted in `Staked`. Rewards come only from votes: freezing without voting keeps `Rewards` at `0` for that stake.

## Two independent claims — never conflate them

Tron has **two separate withdrawal transactions** that do not trigger each other:

- **`ClaimDelegate` → `WithdrawExpireUnfreeze`** — withdraws **matured principal** (an `unfrozenV2` entry whose `expireTime` has passed) back to the wallet. This is claiming *your own unstaked TRX*, not a reward.
- **`ClaimRewards` → `WithdrawBalance`** — withdraws **voting rewards** accrued from your votes. Independent of any unfreeze; has a **24-hour cooldown** and a practical minimum (~1 TRX) enforced on-chain.

Claiming one never claims the other. A wallet UI must offer both actions separately whenever their respective balances (`Claimable`, `Rewards`) are non-zero.

## Partial unstaking is allowed (contrast Cardano)

Unlike Cardano — which rejects partial reward withdrawals and forces a full-balance sweep — Tron's `Undelegate` (`unfreezeBalanceV2`) **allows partial amounts**: `amount ≤ frozen for that resource`, or set `isMaxAmount` to unfreeze the whole position. **Each unfreeze starts its own independent 14-day clock** (`unfreezeDelayDays` chain parameter) and produces its own `unfrozenV2` entry — so a wallet can have several `Pending`/`Claimable` positions in flight simultaneously for the same resource. Tron caps concurrent pending unfreezes at ~32; `assertUnfreeze` validates against the frozen balance for the resource but does not currently special-case the 32-slot cap (surfaces as an on-chain rejection if hit).

## `getDelegations` is resource-granular

A Tron "delegation" in the SDK sense is really **one entry per `frozenV2`/`unfrozenV2` position**, not one entry per SR — this keeps `amount` always the exact, directly-actionable unstake/claim figure instead of an aggregate.

| Source position | `status` | `validator` | `amount` (SUN) | `pendingUntil` |
|---|---|---|---|---|
| `frozenV2[resource]`, backed by votes | `Active` | real SR (enriched + APR) | frozen amount for that resource | 0 |
| `frozenV2[resource]`, no votes covering it | `Frozen` | placeholder | frozen amount for that resource | 0 |
| Unvoted-TP remainder (`Σ frozen − Σ votes > 0`) | `Frozen` | placeholder | remainder | 0 |
| `unfrozenV2[]` entry, not yet expired | `Pending` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |
| `unfrozenV2[]` entry, matured | `Claimable` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |

**Placeholder validator** (used for every `Frozen`/`Pending`/`Claimable` entry, never `null`): `id: "tron-frozen-{resource}"`, `name: "Frozen — vote to earn rewards"`, `status: "Inactive"`, `apy: 0`, `operatorAddress: ""`. Kept non-null so BSC/Cardano-shaped consumers never have to null-check `delegation.validator`.

**Partial-voting remainder rule**: a resource position is `Active` if the account has votes covering it, else `Frozen`. Any leftover unvoted Tron Power (`Σ frozen − Σ votes`) becomes **one extra `Frozen` entry**. In the common case where a user freezes and votes in lockstep for the full amount, there is no remainder and delegations are clean `Active` entries.

`getReward` (unclaimed rewards) is **not** attached per-delegation — it's per-account and lives solely in the `Rewards` balance.

## APR is computed, not fetched — and has a `[VERIFY]` caveat

Tron has no APY REST endpoint (unlike BSC). `getValidators()` computes APR per SR from `listwitnesses` + `getchainparameters` + `getbrokerage`, cached 3 minutes per `page+pageSize` (same pattern as BSC):

```
block_vote_reward      = getWitness127PayPerBlock          (chain parameter)
all_vote_rewards_year  = block_vote_reward × 28800 × 365   (blocks/day × days/year)
annualVotingRewards    = validatorVotes × all_vote_rewards_year / totalVotes
sr_block_rewards       = getWitnessPayPerBlock × 365 × 27  (only if isJobs / top-27 SR)   [VERIFY]
totalAnnualRewards     = annualVotingRewards + sr_block_rewards
brokerage_share        = 1 − (brokerageValue / 100)        (from /wallet/getbrokerage)
APR                    = (totalAnnualRewards × brokerage_share / validatorVotes) × 100
```

> **[VERIFY]** The `sr_block_rewards` term (per `apr_tron.txt`) omits a blocks/day factor and looks dimensionally suspect. It is accepted as-is for now; validate the computed APR against real on-chain numbers for a known SR before relying on it, and correct the term if the reference doc's formula turns out to be wrong. See `apr-calculator.ts` for the isolated, pure implementation.

## Signing (`sign` / `prehash` / `compile`)

TronWeb does the crypto; the interface matches BSC/Cardano.

- **`sign(SigningWithPrivateKey)`** — `buildUnsignedTx` builds the unsigned tx against the FullNode via TronWeb's `transactionBuilder`, then TronWeb signs the `txID` (`SHA256(raw_data)`, **secp256k1** — not Ed25519) with the raw private key, and the fully signed tx is returned as a JSON string for `broadcast`.
- **`prehash(args)`** — builds the same unsigned tx; `serializedTransaction` returned is the **`txID`** itself — the exact digest an external signer must sign. The unbuilt/unsigned raw tx is threaded through `signArgs._rawTx` (a Tron-only extension on `TronSignArgs`, mirroring Cardano's `_txBodyCbor`) so `compile()` can reassemble the exact tx without rebuilding or re-fetching from the FullNode.
- **`compile(CompileArgs)`** — attaches the external signature onto `signArgs._rawTx.signature[]` and returns the serialized signed tx as JSON.
- **`broadcast(rawTx)`** — `POST /wallet/broadcasttransaction`.

`TronSignArgs._rawTx` and `UnsignedTronTx` are defined in `packages/tron/src/tron-chain/tx/tron-types.ts`.

## Worked samples

All amounts in SUN. `TronDelegateTransaction`/`TronUndelegateTransaction` add the required `resource` field on top of the shared `Delegate`/`Undelegate` types; `Vote` is a new shared `Transaction` type requiring `validator` (the SR).

```ts
import { GuardianSDK } from "@guardian-sdk/sdk";
import { tron, type TronDelegateTransaction, type TronUndelegateTransaction } from "@guardian-sdk/tron";
import type { VoteTransaction, ClaimDelegateTransaction, ClaimRewardsTransaction } from "@guardian-sdk/sdk";

const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]); // FullNode HTTP, no TronGrid
const chain = sdk.getChainInfo();

// 1. FREEZE — stake 100 TRX for BANDWIDTH. Gains resource + Tron Power. Earns NOTHING yet.
const freeze: TronDelegateTransaction = {
  type: "Delegate", chain, amount: 100_000_000n, isMaxAmount: false, resource: "BANDWIDTH",
};
await sdk.broadcast(await sdk.sign({ transaction: freeze, fee: await sdk.estimateFee(freeze), nonce: 0, privateKey }));
// getDelegations() → [{ status: "Frozen", amount: 100_000_000n, validator: <placeholder> }]

// 2. VOTE — allocate 100 votes (100 TRX of Tron Power) to a Super Representative. NOW earning rewards.
const vote: VoteTransaction = { type: "Vote", chain, validator: "T<SR-address>", amount: 100_000_000n };
await sdk.broadcast(await sdk.sign({ transaction: vote, fee: await sdk.estimateFee(vote), nonce: 0, privateKey }));
// getDelegations() → [{ status: "Active", amount: 100_000_000n, validator: <real SR> }]

// 3. UNFREEZE — partial unstake of 40 TRX. Starts the 14-day unbonding clock.
const unfreeze: TronUndelegateTransaction = {
  type: "Undelegate", chain, amount: 40_000_000n, isMaxAmount: false, resource: "BANDWIDTH",
};
await sdk.broadcast(await sdk.sign({ transaction: unfreeze, fee: await sdk.estimateFee(unfreeze), nonce: 0, privateKey }));
// getDelegations() → Active 60 TRX + Pending 40 TRX (pendingUntil = now + 14d)

// 4a. CLAIM PRINCIPAL — after 14 days, withdraw the matured unfrozen TRX (WithdrawExpireUnfreeze).
const claimPrincipal: ClaimDelegateTransaction = { type: "ClaimDelegate", chain, amount: 0n, validator: "T<SR-address>", index: 0n };

// 4b. CLAIM REWARDS — independent, anytime rewards accrued (24h cooldown) (WithdrawBalance).
const claimRewards: ClaimRewardsTransaction = { type: "ClaimRewards", chain, amount: 0n, validator: "T<SR-address>" };
```

The full runnable version of this flow is `examples/tron-native-staking-sample.ts`.

**Keep package docs in sync** — when you change balance modelling, signing behaviour, fee shapes, delegation-status mapping, or the APR formula, also update the corresponding tables and examples in `packages/tron/README.md` (drift between code and that README has happened before, on Cardano).
