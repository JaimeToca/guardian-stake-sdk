---
globs: packages/tron/**
---
# Tron

**Service wiring**: `tron()` accepts a `TronConfig` (`rpcUrl`, `logger?`), validates `rpcUrl`, creates a `TronWebFactory` and a thin FullNode RPC client, then composes all services. **FullNode HTTP only — no TronGrid.** `getNonce()` is inlined in the factory and always returns `0` (Tron uses ref-block + expiration, not an account nonce).

**Layer breakdown**:
- `packages/tron/src/tron-chain/index.ts` — `tron()` factory
- `packages/tron/src/chain/index.ts` — `tronMainnet` chain definition and `chains` registry
- `packages/tron/src/tron-chain/services/` — Service factory functions:
  - `createStakingService` — Super Representatives + computed APR (cached), resource-granular `getDelegations`; the pure `computeApr(AprInput)` formula lives (and is exported) here
  - `createBalanceService` — `Available`/`Staked`/`Pending`/`Claimable`/`Rewards`, SUN
  - `createFeeService` — resource-based estimate (`ResourceFee`)
  - `createSignService` — sign / prehash / compile via TronWeb
  - `createBroadcastService` — `POST /wallet/broadcasttransaction`
- `packages/tron/src/tron-chain/rpc/` — `createTronRpcClient` — thin FullNode HTTP client over the shared `fetchOrError` (axios) helper with a json-bigint `transformResponse` for int64 SUN precision (`getaccount`, `getaccountresource`, `getReward`, `listwitnesses`, `getchainparameters`, `getbrokerage`, `getnowblock`, `broadcasttransaction`). Maps responses verbatim — e.g. `getAccountResources` returns raw `freeNetLimit`/`freeNetUsed`/`netLimit`/`netUsed`; deriving available bandwidth is the fee service's job. A rejected broadcast (FullNode returns HTTP 200 with `result:false`) throws the node's real `code` + decoded hex `message`, not a wrapped `ApiError`.
- `packages/tron/src/tron-chain/tronweb/tronweb-factory.ts` — `createTronWebFactory(fullHost)` — builds and signs via TronWeb's `transactionBuilder`/`trx.sign`
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

**Only Stake 2.0 is supported** — legacy Stake 1.0 (`freezeBalance`/`frozen`) is not reflected in `getBalances`/`getDelegations`.

## Two independent claims — never conflate them

Tron has **two separate withdrawal transactions** that do not trigger each other:

- **`ClaimDelegate` → `WithdrawExpireUnfreeze`** — withdraws **matured principal** (an `unfrozenV2` entry whose `expireTime` has passed) back to the wallet. This is claiming *your own unstaked TRX*, not a reward.
- **`ClaimRewards` → `WithdrawBalance`** — withdraws **voting rewards** accrued from your votes. Independent of any unfreeze; has a **24-hour cooldown** and a practical minimum (~1 TRX) enforced on-chain.

Claiming one never claims the other. A wallet UI must offer both actions separately whenever their respective balances (`Claimable`, `Rewards`) are non-zero.

**`validator`/`index` are optional and IGNORED on Tron claims.** `tx-builder.ts` calls `tb.withdrawExpireUnfreeze(ownerAddress)` / `tb.withdrawBlockRewards(ownerAddress)` — neither reads `transaction.validator` or `transaction.index`. Those fields exist on `ClaimDelegateTransaction`/`ClaimRewardsTransaction` only because BSC (`validator`+`index`) and Cardano (`validator`) require them; don't pass dummy values for Tron, and don't add validation that requires them here.

## Fee estimation is resource-aware, floored at 1 SUN/point

`createFeeService.estimateFee` computes bandwidth price as `BigInt(Math.max(1, params.getTransactionFee ?? 1000))` — floored at 1 SUN/point so a chain returning `getTransactionFee: 0` (or omitting it) never produces a free-but-wrong estimate. The fee service derives available bandwidth from the raw `getAccountResources` fields (`(freeNetLimit − freeNetUsed) + (netLimit − netUsed)`, each floored at 0); when that already covers `ESTIMATED_TX_BANDWIDTH` (350 points), the op is genuinely free (`total: 0n`); otherwise the shortfall is burned at the floored price. `ClaimDelegate`/`ClaimRewards` without an `account` fall back to a conservative full burn (no resources to check).

## Partial unstaking is allowed (contrast Cardano) — but `isMaxAmount` is NOT

Unlike Cardano — which rejects partial reward withdrawals and forces a full-balance sweep — Tron's `Undelegate` (`unfreezeBalanceV2`) **allows partial amounts**: `amount ≤ frozen for that resource`. **`isMaxAmount: true` is rejected** on both `Delegate` and `Undelegate` — `tx-builder.ts` throws `ValidationError("INVALID_AMOUNT", ...)` before ever calling TronWeb. Tron requires an exact SUN amount on every freeze/unfreeze; consumers must query `getBalances`/`getDelegations` to determine the max freezable/unfreezable amount and pass it explicitly. Don't reintroduce an `isMaxAmount: true` code path for Tron. **Each unfreeze starts its own independent 14-day clock** (`unfreezeDelayDays` chain parameter) and produces its own `unfrozenV2` entry — so a wallet can have several `Pending`/`Claimable` positions in flight simultaneously for the same resource. Tron caps concurrent pending unfreezes at ~32; `assertUnfreeze` validates against the frozen balance for the resource but does not currently special-case the 32-slot cap (surfaces as an on-chain rejection if hit).

## `getDelegations` is resource-granular

A Tron "delegation" in the SDK sense is really **one entry per `frozenV2`/`unfrozenV2` position**, not one entry per SR — this keeps `amount` always the exact, directly-actionable unstake/claim figure instead of an aggregate.

| Source position | `status` | `validator` | `amount` (SUN) | `pendingUntil` |
|---|---|---|---|---|
| `frozenV2[resource]`, backed by votes | `Active` | real SR (enriched + APR) | frozen amount for that resource | 0 |
| `frozenV2[resource]`, no votes covering it | `Frozen` | placeholder | frozen amount for that resource | 0 |
| Unvoted-TP remainder (`Σ frozen − Σ votes > 0`) | `Frozen` | placeholder | remainder | 0 |
| `unfrozenV2[]` entry, not yet expired | `Pending` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |
| `unfrozenV2[]` entry, matured | `Claimable` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |

**Placeholder validator** (used for every `Frozen`/`Pending`/`Claimable` entry, never `null`): `id: "tron-frozen-{resource}"`, `name: "Frozen — vote to earn rewards"`, `status: "Inactive"`, `apy: 0`, `operatorAddress: ""`. Kept non-null so BSC/Cardano-shaped consumers never have to null-check `delegation.validator`. The `{resource}` is the position's own resource: for `Frozen` it's the frozen resource; for `Pending`/`Claimable` it's the unfreeze's resource, carried through from `unfrozenV2[].type` (`ENERGY` vs `BANDWIDTH`) — an ENERGY unfreeze is never mislabeled as BANDWIDTH. The `Pending`/`Claimable` `id` is `{owner}:unfreeze-{resource}-{expireTime}`, so concurrent unfreezes of different resources never collide.

**Partial-voting remainder rule**: a resource position is `Active` if the account has votes covering it, else `Frozen`. Any leftover unvoted Tron Power (`Σ frozen − Σ votes`) becomes **one extra `Frozen` entry**. In the common case where a user freezes and votes in lockstep for the full amount, there is no remainder and delegations are clean `Active` entries.

`getReward` (unclaimed rewards) is **not** attached per-delegation — it's per-account and lives solely in the `Rewards` balance.

## APR is computed, not fetched — and has a `[VERIFY]` caveat

Tron has no APY REST endpoint (unlike BSC). `getValidators()` computes APR per SR from `listwitnesses` + `getchainparameters` + `getbrokerage`, cached 15 minutes per `page+pageSize` (same pattern as BSC). `getchainparameters` is cached separately for 10 minutes and `getbrokerage` per-SR for 30 minutes, with the brokerage fan-out bounded to 8 concurrent requests, to avoid rate-limiting a real FullNode on cold loads:

```
block_vote_reward      = getWitness127PayPerBlock          (chain parameter)
all_vote_rewards_year  = block_vote_reward × 28800 × 365   (blocks/day × days/year)
annualVotingRewards    = validatorVotes × all_vote_rewards_year / totalVotes
sr_block_rewards       = getWitnessPayPerBlock × 365 × 27  (only if isJobs / top-27 SR)   [VERIFY]
totalAnnualRewards     = annualVotingRewards + sr_block_rewards
brokerage_share        = 1 − (brokerageValue / 100)        (from /wallet/getbrokerage)
APR                    = (totalAnnualRewards × brokerage_share / validatorVotes) × 100
```

The SR block-reward term now uses the corrected formula `(witnessPayPerBlock * BLOCKS_PER_DAY * DAYS_PER_YEAR) / SR_COUNT` (applied as part of PR #73 review feedback). APR values returned by `getValidators()` are now in percent after dividing by `SUN_PER_TRX`. See `computeApr` in `staking-service.ts`.

`computeApr` clamps its output to a sane, finite `[0, …)` range — invalid inputs (`validatorVotes <= 0`, `totalVotes <= 0`) and any non-finite or negative result short-circuit to `0` rather than propagating `NaN`/`Infinity`/negative APR to consumers.

**Real per-SR `getBrokerage` is fetched only for the witnesses actually returned** — the requested page in `getValidators()` (via `enrichApr`), or the distinct voted SRs in `getDelegations()` (deduped) — never all ~439 SRs on a cold load; the cached raw witness list (`RawWitness[]`) carries no brokerage/APR. `stakingSummary.maxApy` is the one exception: it scans every cached witness but uses the DEFAULT brokerage (20%) instead of a real fetch, so it's an approximation.

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
import { GuardianSDK, chains } from "@guardian-sdk/tron";
import { tron, type TronDelegateTransaction, type TronUndelegateTransaction } from "@guardian-sdk/tron";
import type { VoteTransaction, ClaimDelegateTransaction, ClaimRewardsTransaction, SigningWithPrivateKey } from "@guardian-sdk/sdk";

const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]); // FullNode HTTP, no TronGrid
const ADDRESS = "TYourTronBase58Address...";
const privateKey = process.env.TRON_PRIVATE_KEY!;

// 1. FREEZE — stake 100 TRX for BANDWIDTH. Gains resource + Tron Power. Earns NOTHING yet.
const freeze: TronDelegateTransaction = {
  type: "Delegate", chain: chains.tronMainnet, amount: 100_000_000n, isMaxAmount: false, resource: "BANDWIDTH", account: ADDRESS,
};
const freezeFee = await sdk.estimateFee(freeze);
const freezeRawTx = await sdk.sign({ transaction: freeze, fee: freezeFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, freezeRawTx);
// getDelegations() → [{ status: "Frozen", amount: 100_000_000n, validator: <placeholder> }]

// 2. VOTE — allocate 100 votes (100 TRX of Tron Power) to a Super Representative. NOW earning rewards.
const vote: VoteTransaction = { type: "Vote", chain: chains.tronMainnet, validator: "T<SR-address>", amount: 100_000_000n, account: ADDRESS };
const voteFee = await sdk.estimateFee(vote);
const voteRawTx = await sdk.sign({ transaction: vote, fee: voteFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, voteRawTx);
// getDelegations() → [{ status: "Active", amount: 100_000_000n, validator: <real SR> }]

// 3. UNFREEZE — partial unstake of 40 TRX. Starts the 14-day unbonding clock.
const unfreeze: TronUndelegateTransaction = {
  type: "Undelegate", chain: chains.tronMainnet, amount: 40_000_000n, isMaxAmount: false, resource: "BANDWIDTH", account: ADDRESS,
};
const unfreezeFee = await sdk.estimateFee(unfreeze);
const unfreezeRawTx = await sdk.sign({ transaction: unfreeze, fee: unfreezeFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, unfreezeRawTx);
// getDelegations() → Active 60 TRX + Pending 40 TRX (pendingUntil = now + 14d)

// 4a. CLAIM PRINCIPAL — after 14 days, withdraw the matured unfrozen TRX (WithdrawExpireUnfreeze).
// validator/index are optional on ClaimDelegateTransaction and IGNORED by Tron — omit them.
const claimPrincipal: ClaimDelegateTransaction = { type: "ClaimDelegate", chain: chains.tronMainnet, amount: 0n, account: ADDRESS };
const claimPrincipalFee = await sdk.estimateFee(claimPrincipal);
const claimPrincipalRawTx = await sdk.sign({ transaction: claimPrincipal, fee: claimPrincipalFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, claimPrincipalRawTx);

// 4b. CLAIM REWARDS — independent, anytime rewards accrued (24h cooldown) (WithdrawBalance).
// validator is optional on ClaimRewardsTransaction and IGNORED by Tron — omit it.
const claimRewards: ClaimRewardsTransaction = { type: "ClaimRewards", chain: chains.tronMainnet, amount: 0n, account: ADDRESS };
const claimRewardsFee = await sdk.estimateFee(claimRewards);
const claimRewardsRawTx = await sdk.sign({ transaction: claimRewards, fee: claimRewardsFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, claimRewardsRawTx);
```

The full runnable version of this flow is `examples/tron-native-staking-sample.ts`.

**Keep package docs in sync** — when you change balance modelling, signing behaviour, fee shapes, delegation-status mapping, or the APR formula, also update the corresponding tables and examples in `packages/tron/README.md` (drift between code and that README has happened before, on Cardano).
