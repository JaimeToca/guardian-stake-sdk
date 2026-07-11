# Tron Staking — Design Spec

**Date:** 2026-07-11
**Package:** `packages/tron` → `@guardian-sdk/tron`
**Status:** Design (Phase 1 research complete)

## 1. Purpose & Scope

Add a third chain package implementing `GuardianServiceContract` for **Tron (TRX) Stake 2.0**:
staking (freeze) TRX for a resource, voting for Super Representatives, unstaking, and claiming
both unstaked principal and voting rewards — mirroring the BSC/Cardano package pattern.

**In scope:** `getValidators`, `getDelegations`, `getBalances`, `getNonce`, `estimateFee`,
`sign` / `prehash` / `compile`, `broadcast`, `getChainInfo`. Staking operations: **Freeze,
Unfreeze, Vote, Withdraw-expired-unfreeze (claim principal), Withdraw rewards.**

**Out of scope:** `DelegateResourceContract` / `UnDelegateResourceContract` (delegating
energy/bandwidth to *another account* — a resource-sharing feature, not staking-for-rewards),
TRC10/TRC20 tokens, legacy Stake 1.0 (`freezeBalance`).

## 2. Research Basis

Three aligned sources informed this design:

- **SDK contracts** — `packages/sdk` (`Transaction`, `Balance`, `Delegation`, `Fee`, sign args).
- **MetaMask `snap-tron-wallet`** (`~/Desktop/Dev/Typescript/snap-tron-wallet`) — reference for
  the lifecycle, endpoint names, account field shapes, and the TronWeb build/sign/broadcast flow.
- **Grok research + `apr_tron.txt`** — Stake 2.0 semantics and the APR formula.

**Confirmed facts:**
- Smallest unit is **SUN**, `1 TRX = 1_000_000 SUN`, `decimals: 6`. (The brief said "MIST" — that
  is Sui's unit and is **wrong** for Tron.)
- **Unbonding period: 14 days** (`unfreezeDelayDays` chain parameter, governance-votable).
- **Rewards do NOT auto-compound** — claimed manually via `WithdrawBalance`, **24h cooldown**,
  1 TRX minimum, separate from staked principal.
- **Voting power (Tron Power) is 1:1 with staked TRX** (1 TRX frozen = 1 vote). You cannot vote
  without freezing; freezing without voting earns **nothing** (only the resource). Up to 30 SRs.
- **Signing:** FullNode/TronWeb builds unsigned tx, `txID = SHA256(raw_data)`, sign the txID with
  **secp256k1 ECDSA**, append to `signature[]`, broadcast.

## 3. Locked Decisions

| Decision | Choice |
|---|---|
| Package | `packages/tron` → `@guardian-sdk/tron`, depends on `@guardian-sdk/sdk` (peer) |
| Units | SUN, `1 TRX = 10⁶`, decimals 6 |
| RPC provider | **FullNode HTTP API only**, configurable URL — **no TronGrid** |
| Tx construction | **TronWeb `transactionBuilder`** (server-side build via node endpoints), `fullHost` = the configured FullNode |
| Signing | TronWeb signs `txID` (secp256k1) for `sign()`; `prehash`/`compile` for MPC/external |
| Freeze / Unfreeze | reuse `Delegate` / `Undelegate` (validator omitted; Tron `resource` added) |
| Vote | **new `Vote` transaction** (SR required) |
| Claim unstaked principal | reuse `ClaimDelegate` → `WithdrawExpireUnfreeze` |
| Claim voting rewards | reuse `ClaimRewards` → `WithdrawBalance` |
| Delegation granularity | **resource-granular** (one delegation per `frozenV2` / `unfrozenV2` position) |
| APR | **computed** from `listwitnesses` + `getchainparameters` + `getbrokerage` |
| `getNonce` | inlined, always returns `0` (Tron uses ref-block + expiration, no account nonce) |

## 4. Architecture

Mirrors BSC/Cardano. `tron()` factory wires a thin FullNode RPC client + a TronWeb factory into
the standard services and returns a plain `GuardianServiceContract` object (no facade class).

```
packages/tron/src/
  tron-chain/
    index.ts                 → tron({ rpcUrl, logger }) factory
    rpc/
      tron-rpc-client.ts     → thin FullNode HTTP client (reads + broadcast):
                                 /wallet/getaccount, /wallet/getaccountresource,
                                 /wallet/getReward, /wallet/listwitnesses,
                                 /wallet/getchainparameters, /wallet/getbrokerage,
                                 /wallet/getnowblock, /wallet/broadcasttransaction
      tron-rpc-client-contract.ts
    tronweb/
      tronweb-factory.ts     → createClient(fullHost, privateKey?) — build + sign
    services/
      staking-service.ts     → getValidators (SRs + computed APR, cached), getDelegations
      balance-service.ts     → Available / Staked / Pending / Claimable / Rewards
      fee-service.ts         → resource/bandwidth-based estimate (ResourceFee)
      sign-service.ts        → sign / prehash / compile
      broadcast-service.ts   → /wallet/broadcasttransaction
    apr/
      apr-calculator.ts      → APR formula (isolated, pure, unit-testable)
    tx/
      tx-builder.ts          → maps SDK Transaction → TronWeb transactionBuilder call
      tron-types.ts          → TronDelegateTransaction (resource), sign-arg extensions
      validations.ts         → amount/vote/resource/SR validations
  chain/
    index.ts                 → tronMainnet chain def + chains registry
  index.ts                   → package entry (re-exports @guardian-sdk/sdk)
```

**Service wiring (`tron()`):** validate `rpcUrl` → build `createTronWebFactory(fullHost=rpcUrl)`
and `createTronRpcClient(rpcUrl, logger)` → compose the five services (staking caches the witness
list per `page+pageSize`, 3-min TTL, like BSC) → return the contract. `getNonce` is inlined to
return `0`.

## 5. Shared SDK Changes

These touch `packages/sdk` and therefore **trigger a `/doc-drift` README pass** and must respect
the changeset `ignore` trap (never mix `@guardian-sdk/tron`, if ignored, with non-ignored packages).

1. **`DelegationStatus`** gains **`"Frozen"`**:
   `"Active" | "Pending" | "Claimable" | "Inactive" | "Frozen"`. Documented as **Tron-only**
   (like `"Claimable"` is BSC-only). Means: staked/frozen but **not voted** — earning the resource
   only, no TRX rewards until the user votes.

2. **`Transaction` union** gains **`VoteTransaction`**, and `TransactionType` gains `"Vote"`:
   ```ts
   export interface VoteTransaction extends BaseTransaction {
     type: "Vote";
     validator: Validator | OperatorAddress; // REQUIRED — the SR to vote for
     // amount (SUN) = votes × 10⁶; must be a whole number of TRX
   }
   ```

3. **`validator` becomes optional** on `DelegateTransaction` and `UndelegateTransaction`
   (Tron freeze/unfreeze target a resource, not an SR). A shared guard
   `assertValidator(tx): asserts tx has validator` is added and called by **BSC and Cardano**
   in their sign/fee paths, preserving their runtime invariant. Trade-off: BSC/Cardano lose
   *compile-time* requiredness on that field; accepted, consistent with the codebase's existing
   runtime-validation pattern.

4. **`Fee` union** gains **`ResourceFee`** (Tron's fee model is neither gas nor UTxO):
   ```ts
   export interface ResourceFee {
     type: "ResourceFee";
     bandwidth: bigint;   // bandwidth points consumed
     energy: bigint;      // energy consumed (≈0 for pure staking ops)
     total: bigint;       // TRX burned in SUN when free/available resources don't cover it
   }
   ```
   `FeeType` gains `"ResourceFee"`.

## 6. Transaction Taxonomy (SDK → Tron)

| SDK `Transaction` | Tron contract | TronWeb builder | Notes |
|---|---|---|---|
| `Delegate` (+ `resource`) | `FreezeBalanceV2Contract` | `freezeBalanceV2(amount, resource, owner)` | validator omitted |
| `Undelegate` | `UnfreezeBalanceV2Contract` | `unfreezeBalanceV2(amount, resource, owner)` | validator omitted; starts 14-day bond |
| `Vote` (new) | `VoteWitnessContract` | `vote({ [sr]: votes }, owner)` | validator (SR) required |
| `ClaimDelegate` | `WithdrawExpireUnfreezeContract` | `withdrawExpireUnfreeze(owner)` | claims matured principal |
| `ClaimRewards` | `WithdrawBalanceContract` | `withdrawBlockRewards(owner)` | claims voting rewards, 24h cooldown |

**Tron-only extension** (`tron-types.ts`, shared `Transaction` otherwise unchanged aside from §5):
```ts
export interface TronDelegateTransaction extends DelegateTransaction {
  resource: "ENERGY" | "BANDWIDTH"; // required for Tron freeze
}
export interface TronUndelegateTransaction extends UndelegateTransaction {
  resource: "ENERGY" | "BANDWIDTH";
}
```
`tx-builder.ts` narrows on `tx.type`, casts to the Tron extension to read `resource`, and calls
the matching TronWeb builder. **`Vote` amount is in SUN**; the builder converts `votes = amount / 10⁶`
and rejects non-whole-TRX amounts.

## 7. `getDelegations(address)` — Full Lifecycle

A Tron "delegation" = **a vote for an SR**, but the list also surfaces frozen-but-unvoted stake and
unbonding positions so the user sees a complete BSC-style journey:
**Freeze → `Frozen` → Vote → `Active` → Unfreeze → `Pending` → matured → `Claimable` → withdraw.**

**Data source:** `POST /wallet/getaccount { visible: true }` → `balance`, `frozenV2[]`,
`unfrozenV2[]`, `votes[]`; SR metadata + APR from the cached `getValidators()` witness map.

**Resource-granular mapping** (one delegation per position — so `amount` is always the exact,
directly actionable unstake/claim amount):

| Source position | `status` | `validator` | `amount` (SUN) | `pendingUntil` |
|---|---|---|---|---|
| `frozenV2[resource]`, backed by votes | `Active` | real SR (enriched + APR) | frozen amount for that resource | 0 |
| `frozenV2[resource]`, no votes covering it | `Frozen` | placeholder | frozen amount for that resource | 0 |
| Unvoted-TP remainder (`Σ frozen − Σ votes > 0`) | `Frozen` | placeholder | remainder | 0 |
| `unfrozenV2[]` entry, not yet expired | `Pending` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |
| `unfrozenV2[]` entry, matured | `Claimable` | placeholder | `unfreeze_amount` | `unfreeze_expire_time` |

- **`amount` is always the actionable figure** — a `Frozen`/`Active` delegation carries the
  per-resource frozen TRX the user can `Undelegate` (unfreeze); a `Claimable` delegation carries
  the TRX the user can `ClaimDelegate` (withdraw).
- **Placeholder validator** (`Frozen`/`Pending`/`Claimable`): `id: "tron-frozen-{resource}"`,
  `name: "Frozen — vote to earn rewards"`, `description` explains the user is earning the resource
  only and must vote to earn TRX, `status: "Inactive"`, `apy: 0`, `operatorAddress: ""`. Kept
  non-null so BSC/Cardano consumers never null-check.
- **Partial-voting rule:** a resource position is `Active` if the account has votes, else `Frozen`;
  any leftover unvoted TP (`Σ frozen − Σ votes`) becomes one extra `Frozen` entry. In the common
  freeze-and-vote-in-lockstep flow there is no remainder → clean `Active` positions.
- **`getReward` (unclaimed rewards) is NOT attached per-delegation** — it's per-account, so it
  lives solely in the `Rewards` balance.

**`stakingSummary`:**

| field | source |
|---|---|
| `totalProtocolStake` | Σ witness `voteCount` across all SRs |
| `maxApy` | max computed APR |
| `minAmountToStake` | `1_000_000n` (1 TRX freeze minimum) |
| `unboundPeriodInMillis` | `unfreezeDelayDays × 86_400_000` (14 days) |
| `redelegateFeeRate` | `0` (Tron has no redelegation) |
| `activeValidators` | 27 (SRs with `isJobs = true`) |
| `totalValidators` | witness list length |

## 8. `getValidators` & APR

`getValidators` returns Super Representatives from `POST /wallet/listwitnesses`, each mapped to a
`Validator` with a **computed** APR (Tron has no APY endpoint, unlike BSC's REST metadata). Cached
per `page+pageSize` for 3 minutes; the same witness map serves `getDelegations`.

**APR calculator** (pure function in `apr/apr-calculator.ts`, per `apr_tron.txt`):
```
block_vote_reward      = getWitness127PayPerBlock          (chain parameter)
all_vote_rewards_year  = block_vote_reward × 28800 × 365   (blocks/day × days/year)
annualVotingRewards    = validatorVotes × all_vote_rewards_year / totalVotes
sr_block_rewards       = getWitnessPayPerBlock × 365 × 27  (only if isJobs / top-27 SR)   [VERIFY]
totalAnnualRewards     = annualVotingRewards + sr_block_rewards
brokerage_share        = 1 − (brokerageValue / 100)        (from /wallet/getbrokerage)
APR                    = (totalAnnualRewards × brokerage_share / validatorVotes) × 100
```
> **[VERIFY]** The `sr_block_rewards` term in `apr_tron.txt` omits a blocks/day factor and looks
> dimensionally suspect. During the test phase, the computed APR is validated against real on-chain
> numbers for a known SR; the exact block-reward term is corrected there if needed.

`Validator` mapping: `id`/`operatorAddress` = SR address; `name`/`image` from the SR `url`
metadata; `status` = `Active` (top-27 producing) / `Inactive`; `apy` = computed APR;
`delegators` = undefined (not exposed by `listwitnesses`).

## 9. `getBalances(address)`

From `getAccount` + `getReward`, in SUN, with **no double-counting**:

| `BalanceType` | source |
|---|---|
| `Available` | `getAccount.balance` (liquid TRX) |
| `Staked` | `Σ frozenV2[].amount` (frozen principal, both resources) |
| `Pending` | `Σ unfrozenV2[]` still unbonding (`expire_time` in the future) |
| `Claimable` | `Σ unfrozenV2[]` matured (`expire_time` passed) |
| `Rewards` | `getReward` (unclaimed voting rewards) |

## 10. Signing (`sign` / `prehash` / `compile`)

Same interface as BSC/Cardano; TronWeb does the crypto.

- **`sign(SigningWithPrivateKey)`** — `tx-builder` builds the unsigned tx via TronWeb against the
  FullNode, TronWeb signs the `txID` (secp256k1) with `privateKey`, return the serialized signed tx
  (JSON string) for `broadcast`.
- **`prehash(args)`** — build the unsigned tx via TronWeb; `serializedTransaction` =
  the **`txID`** (the SHA256 hash the external signer must sign). The unsigned raw tx is threaded
  through `signArgs` via a Tron-only extension `_rawTx` (mirrors Cardano's `_txBodyCbor`) so
  `compile` reassembles the exact tx without rebuilding.
- **`compile(CompileArgs)`** — attach the external `signature` to `signArgs._rawTx.signature[]`,
  return the serialized signed tx.
- **`broadcast(rawTx)`** — `POST /wallet/broadcasttransaction`.

`_rawTx` and the Tron sign-arg extensions are defined in `tron-types.ts`.

## 11. Validations (`validations.ts`, enforced in `estimateFee` + `sign`)

- **Freeze (`Delegate`)**: `amount ≥ 1 TRX (1_000_000 SUN)`; `amount ≤ Available`;
  `resource ∈ {ENERGY, BANDWIDTH}`.
- **Vote (`Vote`)**: SR exists in the witness list and is active; `amount > 0` and a **whole number
  of TRX** (`amount % 1_000_000 === 0`); `votes ≤ availableTronPower` (`Σ frozen − Σ existing votes`)
  → reject over-voting.
- **Unfreeze (`Undelegate`)**: **partial amounts allowed** — `amount ≤ frozen for that resource`
  (or `isMaxAmount` to unfreeze the whole position). Each unfreeze starts its own 14-day clock;
  respect the ~32 concurrent-pending-unfreeze cap. (Contrast: Cardano rejects partial withdrawals.)
- **Reject** native-token / non-TRX payloads upstream (architectural, like BSC's BNB-only rule).

## 12. Fee Estimation

Tron fees are **resource-based**, not gas: a tx consumes **bandwidth** (∝ serialized size) and,
for contract calls, **energy** (≈0 for pure staking ops). Shortfalls against free/available
resources are **burned as TRX**. `estimateFee(tx)` builds the tx (TronWeb), measures its byte size,
reads free/available bandwidth (`/wallet/getaccountresource`) and unit prices
(`/wallet/getchainparameters` / `getbandwidthprices`), and returns a `ResourceFee`
(`bandwidth`, `energy`, `total` TRX burn in SUN).

## 13. Testing (deterministic fixtures, hardcoded expected values)

- **`getDelegations` lifecycle** — fixtures for: freeze-only (asserts one `Frozen` placeholder
  delegation carrying the unstakeable amount), voted (asserts `Active` with real SR), partial-vote
  (asserts `Active` + `Frozen` remainder), unbonding (`Pending` with `pendingUntil`), matured
  (`Claimable`). Resource-granular counts asserted.
- **Balances** — mapping from a fixed `getAccount` + `getReward` to the five balance types.
- **APR** — fixed chain-params/witness inputs → expected APR (and validate against a real SR's
  on-chain numbers to settle the `[VERIFY]` block-reward term).
- **Address & signing** — known private key → known Tron base58 address; build each staking tx →
  known `txID`; sign → known signature (real values derived via TronWeb).
- **Validations** — over-vote, sub-1-TRX freeze, non-whole-TRX vote, unfreeze exceeding frozen.

## 14. Examples

`examples/tron-native-staking-sample.ts` (path-aliased to package source; type-checked separately
via `examples/tsconfig.json`): full flow — freeze → `getDelegations` (shows `Frozen`) → vote →
`getDelegations` (shows `Active`) → unfreeze → `getDelegations` (shows `Pending`) → claim principal
(`ClaimDelegate`) **and** claim rewards (`ClaimRewards`) as two separate txs.

## 15. Package Plumbing

- `packages/tron/package.json` — `@guardian-sdk/tron`, dep `tronweb` (chain lib, like `viem` for
  BSC), peer dep `@guardian-sdk/sdk`. tsup build config.
- `tsconfig`, build order: **sdk → tron** (alongside bsc/cardano).
- Root `CLAUDE.md` — add the tron package, build order, and `tronweb` to key deps.
- `packages/tron/README.md` — interface/table docs (kept in sync via `/doc-drift`).

## 16. Documentation Deliverables (required)

### 16.1 `.claude/rules/tron.md` — chain rules + mechanics explainer

A first-class deliverable, structured and sized like `.claude/rules/bsc.md` and
`.claude/rules/cardano.md` (loaded automatically when editing `packages/tron/**`). It must
**explain how Tron delegation, freezing, and voting actually work** — not just list files — and
include worked code samples. Required content:

- **Service wiring** — `tron()` config (`rpcUrl`, `logger`), FullNode-only, no TronGrid; TronWeb
  factory + thin RPC client.
- **Layer breakdown** — the file map from §4.
- **The freeze → vote → unfreeze → claim lifecycle**, spelled out as the core mental model:
  ```
  Freeze (Delegate)      stake TRX for a resource → gain resource + Tron Power   → delegation: Frozen
    │                    (earning the RESOURCE only — NO TRX rewards yet)
  Vote (Vote)            allocate Tron Power to a Super Representative            → delegation: Active
    │                    (now earning TRX voting rewards)
  Unfreeze (Undelegate)  begin unstaking (partial allowed); 14-day bond starts   → delegation: Pending
    │
  (14 days later)                                                                → delegation: Claimable
    ├─ ClaimDelegate     WithdrawExpireUnfreeze → matured principal back to wallet
    └─ ClaimRewards      WithdrawBalance        → voting rewards (24h cooldown), independent of above
  ```
- **Freeze ≠ Vote** — the single most important Tron gotcha: **freezing alone earns nothing.**
  Document that a `Frozen` delegation is the signal the user must still vote.
- **Resource model** — ENERGY vs BANDWIDTH; Tron Power granted 1:1 regardless of resource;
  resource is a Tron-only field on `Delegate`/`Undelegate`.
- **Units** — SUN, `1 TRX = 10⁶`; vote amounts are whole TRX (`amount % 1_000_000 === 0`).
- **Balances** — `Available`/`Staked`/`Pending`/`Claimable`/`Rewards`; `controlled` vs frozen; no
  double-counting; rewards come only from votes.
- **Two independent claims** — `ClaimDelegate` (principal) vs `ClaimRewards` (rewards); neither
  triggers the other.
- **Partial unstaking** — allowed (contrast Cardano); each unfreeze has its own clock; 32-cap.
- **`getDelegations` is resource-granular** — one delegation per `frozenV2`/`unfrozenV2` position;
  placeholder validator for `Frozen`/`Pending`/`Claimable`; the partial-voting remainder rule.
- **APR is computed** — the formula + the `[VERIFY]` caveat.
- **Signing** — TronWeb builds → sign `txID` (secp256k1); `prehash`/`compile` thread `_rawTx`.
- **"Keep package docs in sync"** footer (like Cardano's) pointing at the README.

### 16.2 Worked samples (in the rules file **and** `examples/tron-native-staking-sample.ts`)

The rules file embeds these; the example file is the full runnable version (path-aliased,
type-checked via `examples/tsconfig.json`). All amounts in SUN.

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

## 17. Open Decisions (confirm before implementation)

## 16. Open Decisions (confirm before implementation)

1. **Release channel** — publish `@guardian-sdk/tron` under the `alpha` dist-tag and add it to the
   changeset `ignore` array (mirrors Cardano's rollout)? **Recommended: yes.**
2. **`sr_block_rewards` APR term** — accept the `apr_tron.txt` formula as-is and correct during
   testing against real numbers (per the `[VERIFY]` note)? **Recommended: yes.**
