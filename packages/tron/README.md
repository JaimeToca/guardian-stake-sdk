# @guardian-sdk/tron — Tron

Native staking support for Tron (TRX Stake 2.0), part of the [Guardian SDK](../../README.md).

Abstracts TronWeb transaction construction and FullNode REST calls behind a clean, type-safe API so you can freeze TRX for a resource, vote for Super Representatives, unstake, and claim rewards without dealing with TronWeb internals directly.

> **FullNode only — no TronGrid.** `tron({ rpcUrl })` talks directly to a configurable FullNode HTTP endpoint. Point it at your own node or a FullNode-compatible provider.

## Table of Contents

- [How Tron Native Staking Works](#how-tron-native-staking-works)
  - [Freeze, Resource, and Tron Power](#freeze-resource-and-tron-power)
  - [Freeze ≠ Vote — freezing alone earns nothing](#freeze--vote--freezing-alone-earns-nothing)
  - [Lifecycle of a Stake](#lifecycle-of-a-stake)
  - [Two Independent Claims](#two-independent-claims)
  - [Partial Unstaking](#partial-unstaking)
  - [APR](#apr)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [tron()](#tron)
  - [getValidators](#getvalidators)
  - [getDelegations](#getdelegations)
  - [getBalances](#getbalances)
  - [getNonce](#getnonce)
  - [estimateFee](#estimatefee)
  - [sign](#sign)
  - [prehash and compile](#prehash-and-compile)
- [Transaction Flows](#transaction-flows)
- [Signing Flows](#signing-flows)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)

---

## How Tron Native Staking Works

Tron Stake 2.0 splits staking into two independent, separately-signed actions: **freezing** TRX for a resource, and **voting** frozen Tron Power to a Super Representative (SR). Unlike BSC or Cardano, TRX rewards are earned only through the second step.

### Freeze, Resource, and Tron Power

Freezing TRX (`Delegate`) locks it in exchange for one of two resources, chosen per transaction:

- **BANDWIDTH** — needed for regular transactions (transfers, most contract calls)
- **ENERGY** — needed for smart-contract execution (TRC20 transfers, DApp calls)

Regardless of which resource is chosen, freezing grants **Tron Power 1:1 with the frozen TRX** — 100 TRX frozen for either resource gives 100 votes of Tron Power. `resource` is a Tron-only field, present on `TronDelegateTransaction`/`TronUndelegateTransaction` but not on the shared SDK `DelegateTransaction`/`UndelegateTransaction`.

### Freeze ≠ Vote — freezing alone earns nothing

**The single most important thing to understand about this package**: freezing TRX earns you the chosen resource (ENERGY/BANDWIDTH) and Tron Power, but **zero TRX rewards** until you submit a separate `Vote` transaction allocating that Tron Power to a Super Representative. `getDelegations()` reflects this with a dedicated `"Frozen"` status — a standing signal that the position is staked but not yet voted.

### Lifecycle of a Stake

```text
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

### Two Independent Claims

Tron has two separate withdrawal transactions that never trigger each other:

| Transaction | Tron contract | Claims |
|---|---|---|
| `ClaimDelegate` | `WithdrawExpireUnfreezeContract` | Matured unfrozen **principal** back to the wallet |
| `ClaimRewards` | `WithdrawBalanceContract` | Accrued voting **rewards** (24-hour cooldown) |

### Partial Unstaking

Unlike Cardano — which forces a full-balance reward withdrawal — Tron's `Undelegate` allows **partial amounts**: unfreeze less than the full frozen balance for a resource. **`isMaxAmount: true` is rejected** on both `Delegate` and `Undelegate` — Tron requires an exact SUN amount; query `getBalances`/`getDelegations` to determine the max freezable/unfreezable amount before building the transaction. Each unfreeze starts its own independent 14-day unbonding clock and produces its own claimable position (up to a ~32 concurrent-pending cap enforced on-chain).

### APR

Tron has no APY REST endpoint. `getValidators()` **computes** APR per Super Representative from `listwitnesses` + `getchainparameters` + `getbrokerage`, cached 3 minutes. The computed value is clamped to a sane, finite `[0, …)` range — it never returns negative, `NaN`, or `Infinity`.

APR values are in percent (e.g. `2.48` means 2.48%). The formula accounts for the vote reward pool plus (for actual top-27 SRs) the block production reward, scaled by the SR's brokerage rate.

---

## Installation

```bash
npm install @guardian-sdk/tron @guardian-sdk/sdk tronweb@6.1.0
```

| Package | Version | Role |
|---|---|---|
| [`@guardian-sdk/sdk`](https://www.npmjs.com/package/@guardian-sdk/sdk) | `workspace:^` | Peer — chain-agnostic core, shared types and interfaces |
| `tronweb` | `6.1.0` | Dependency — transaction building, signing, and FullNode communication |

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import { tron, chains } from "@guardian-sdk/tron";
import type { TronDelegateTransaction } from "@guardian-sdk/tron";

const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]);

const ADDRESS = "TYourTronBase58Address...";
const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY!;

// 1. Browse Super Representatives
const { data: validators } = await sdk.getValidators(chains.tronMainnet);
console.log(`${validators.length} SRs found`);

// 2. Check current delegations
const { delegations, stakingSummary } = await sdk.getDelegations(chains.tronMainnet, ADDRESS);
console.log(`Max APR: ${stakingSummary.maxApy.toFixed(2)}%`);

// 3. Check balances (SUN)
const balances = await sdk.getBalances(chains.tronMainnet, ADDRESS);
for (const b of balances) {
  console.log(b.type, Number(b.amount) / 1e6, "TRX");
}

// 4. Freeze 100 TRX for BANDWIDTH
const freeze: TronDelegateTransaction = {
  type: "Delegate",
  chain: chains.tronMainnet,
  amount: 100_000_000n,
  isMaxAmount: false,
  resource: "BANDWIDTH",
};
const fee = await sdk.estimateFee(freeze);
const rawTx = await sdk.sign({ transaction: freeze, fee, nonce: 0, privateKey: PRIVATE_KEY });
const txHash = await sdk.broadcast(chains.tronMainnet, rawTx);
console.log(`Frozen! https://tronscan.org/#/transaction/${txHash}`);
```

---

## API Reference

### `tron()`

Factory function. Returns a `GuardianServiceContract` for Tron mainnet.

```typescript
function tron(config: TronConfig): GuardianServiceContract

interface TronConfig {
  rpcUrl: string;   // FullNode HTTP endpoint (no TronGrid)
  logger?: Logger;  // optional; defaults to NoopLogger
}
```

---

### `getValidators`

Returns Super Representatives from `/wallet/listwitnesses`, each with a **computed** APR. Cached per `page+pageSize` for 3 minutes.

```typescript
const { data, pagination } = await sdk.getValidators(chains.tronMainnet);
const page2 = await sdk.getValidators(chains.tronMainnet, { page: 2, pageSize: 50 });
```

**Returns:** `Promise<ValidatorsPage>`

```typescript
interface Validator {
  id: string;                      // SR base58 address
  status: ValidatorStatus;         // "Active" (top-27 producing) | "Inactive"
  name: string;                    // SR url metadata, or address
  description: string;
  image: undefined;                // Not exposed by listwitnesses
  apy: number;                     // Computed APR in percent (e.g. 2.48 for 2.48%)
  delegators: undefined;           // Not exposed by listwitnesses
  operatorAddress: string;         // SR base58 address — use in transaction.validator
  creditAddress: string;           // ""
}
```

---

### `getDelegations`

Returns **resource-granular** delegations — one entry per `frozenV2`/`unfrozenV2` position, so `amount` is always the exact actionable unstake/claim figure.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(chains.tronMainnet, ADDRESS);
```

**Returns:** `Promise<Delegations>`

```typescript
interface Delegation {
  id: string;
  validator: Validator;        // Real SR when Active; placeholder otherwise (never null)
  amount: bigint;               // SUN — exact frozen/unfreezing amount for this position
  status: DelegationStatus;
  delegationIndex: bigint;
  pendingUntil: number;         // ms epoch; unfreeze_expire_time for Pending/Claimable, 0 otherwise
}

type DelegationStatus = "Active" | "Pending" | "Claimable" | "Inactive" | "Frozen";
```

| `status` | Meaning |
|---|---|
| `Active` | Frozen and covered by a vote — earning both the resource and TRX rewards |
| `Frozen` | Frozen but not (fully) voted — earning the resource only, **no TRX rewards yet** |
| `Pending` | Unfreeze submitted, still inside the 14-day unbonding period |
| `Claimable` | Unfreeze matured — withdraw the principal with `ClaimDelegate` |

> **Placeholder validator** — every `Frozen`/`Pending`/`Claimable` delegation carries a non-null placeholder validator (`id: "tron-frozen-{resource}"`, `name: "Frozen — vote to earn rewards"`, `apy: 0`, `status: "Inactive"`) so consumers never have to null-check `delegation.validator`.

> **Partial-voting remainder** — if the account's total frozen Tron Power exceeds its total votes, the unvoted remainder appears as one extra `Frozen` delegation. Freezing and voting the full amount in lockstep produces no remainder.

```typescript
interface StakingSummary {
  totalProtocolStake: number;   // Σ SR voteCount
  maxApy: number;               // Max computed APR across SRs
  minAmountToStake: bigint;     // 1_000_000n (1 TRX freeze minimum)
  unboundPeriodInMillis: number; // unfreezeDelayDays × 86_400_000 (14 days)
  redelegateFeeRate: 0;         // Tron has no redelegation
  activeValidators: number;     // Top-27 producing SRs
  totalValidators: number;      // Full witness list length
}
```

---

### `getBalances`

Returns balance information for a Tron address. All amounts in SUN (1 TRX = 1,000,000 SUN).

```typescript
const balances = await sdk.getBalances(chains.tronMainnet, ADDRESS);
```

**Returns:** `Promise<Balance[]>`

| `BalanceType` | What it represents on Tron |
|---|---|
| `Available` | Liquid TRX (`getAccount.balance`) |
| `Staked` | Σ frozen principal across both resources (`frozenV2`) |
| `Pending` | Σ unfreezing entries still inside the 14-day bond |
| `Claimable` | Σ unfreezing entries that have matured — withdrawable via `ClaimDelegate` |
| `Rewards` | Unclaimed voting rewards (`getReward`) — withdrawable via `ClaimRewards` |

No double-counting: an amount that has started unfreezing is no longer counted in `Staked`, and rewards come only from votes (freezing without voting keeps `Rewards` at `0` for that stake).

---

### `getNonce`

Tron uses ref-block + expiration, not an account nonce. This always returns `0`.

```typescript
const nonce = await sdk.getNonce(chains.tronMainnet, ADDRESS); // always 0
```

---

### `estimateFee`

Tron fees are **resource-based**, not gas: a transaction consumes bandwidth (∝ serialized size) and, for contract calls, energy (≈0 for pure staking ops). When the account's free + staked bandwidth already covers the estimated transaction size, the operation is genuinely free (`total: 0n`); otherwise the shortfall is burned as TRX at the chain's per-point price (`getTransactionFee`), floored at 1 SUN/point so a misreported `0` from the chain parameters never produces a free fee.

```typescript
const fee = await sdk.estimateFee(transaction);
```

**Returns:** `Promise<ResourceFee>`

```typescript
interface ResourceFee {
  type: "ResourceFee";
  bandwidth: bigint;   // Bandwidth points consumed
  energy: bigint;       // Energy consumed (≈0 for pure staking ops)
  total: bigint;        // TRX burned (SUN) when free/available resources don't cover it
}
```

---

### `sign`

Signs a Tron transaction and returns the serialized signed transaction (JSON string) ready to broadcast.

```typescript
const rawTx = await sdk.sign({
  transaction,
  fee,
  nonce: 0,          // unused; Tron has no account nonce
  privateKey,         // raw secp256k1 private key hex
});
```

Internally: `buildUnsignedTx` builds the unsigned transaction via TronWeb's `transactionBuilder` against the configured FullNode, TronWeb signs the `txID` (`SHA256(raw_data)`, **secp256k1**) with the private key, and the fully signed transaction is returned as JSON.

---

### `prehash` and `compile`

For MPC wallets, hardware signers, or custody setups where private keys are not available in the application process.

```typescript
const { serializedTransaction, signArgs } = await sdk.prehash({ transaction, fee, nonce: 0 });
// serializedTransaction === the txID (SHA256 of raw_data) — the exact value an external
// secp256k1 signer must sign. The unbuilt raw tx is carried in signArgs._rawTx for compile().

const rawTx = await sdk.compile({
  signArgs,
  signature: externalSignatureHex, // secp256k1 signature over serializedTransaction
});

const txHash = await sdk.broadcast(chains.tronMainnet, rawTx);
```

`signArgs` from `prehash()` must be passed through unchanged to `compile()`.

---

## Transaction Flows

```typescript
import { GuardianSDK, chains } from "@guardian-sdk/tron";
import { tron, type TronDelegateTransaction, type TronUndelegateTransaction } from "@guardian-sdk/tron";
import type { VoteTransaction, ClaimDelegateTransaction, ClaimRewardsTransaction } from "@guardian-sdk/sdk";

const sdk = new GuardianSDK([tron({ rpcUrl: "https://<your-tron-fullnode>" })]);
const ADDRESS = "TYourTronBase58Address..."; // owner address
const privateKey = process.env.TRON_PRIVATE_KEY!;

// FREEZE — stake 100 TRX for BANDWIDTH. Gains resource + Tron Power. Earns NOTHING yet.
const freeze: TronDelegateTransaction = {
  type: "Delegate", chain: chains.tronMainnet, amount: 100_000_000n, isMaxAmount: false, resource: "BANDWIDTH", account: ADDRESS,
};
const freezeFee = await sdk.estimateFee(freeze);
const freezeSigned = await sdk.sign({ transaction: freeze, fee: freezeFee, nonce: 0, privateKey }); // Tron has no account nonce
await sdk.broadcast(chains.tronMainnet, freezeSigned);

// VOTE — allocate 100 votes (100 TRX of Tron Power) to a Super Representative. NOW earning rewards.
const vote: VoteTransaction = { type: "Vote", chain: chains.tronMainnet, validator: "T<SR-address>", amount: 100_000_000n, account: ADDRESS };
const voteFee = await sdk.estimateFee(vote);
const voteSigned = await sdk.sign({ transaction: vote, fee: voteFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, voteSigned);

// UNFREEZE — partial unstake of 40 TRX. Starts the 14-day unbonding clock.
const unfreeze: TronUndelegateTransaction = {
  type: "Undelegate", chain: chains.tronMainnet, amount: 40_000_000n, isMaxAmount: false, resource: "BANDWIDTH", account: ADDRESS,
};
const unfreezeFee = await sdk.estimateFee(unfreeze);
const unfreezeSigned = await sdk.sign({ transaction: unfreeze, fee: unfreezeFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, unfreezeSigned);

// CLAIM PRINCIPAL — after 14 days, withdraw the matured unfrozen TRX.
// validator/index are optional on ClaimDelegateTransaction and IGNORED by Tron
// (withdrawExpireUnfreeze withdraws whatever has matured for this account) — omit them.
const claimPrincipal: ClaimDelegateTransaction = { type: "ClaimDelegate", chain: chains.tronMainnet, amount: 0n, account: ADDRESS };
const claimPrincipalFee = await sdk.estimateFee(claimPrincipal);
const claimPrincipalSigned = await sdk.sign({ transaction: claimPrincipal, fee: claimPrincipalFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, claimPrincipalSigned);

// CLAIM REWARDS — independent, anytime rewards accrued (24h cooldown).
// validator is optional on ClaimRewardsTransaction and IGNORED by Tron
// (withdrawBlockRewards withdraws the whole account reward balance) — omit it.
const claimRewards: ClaimRewardsTransaction = { type: "ClaimRewards", chain: chains.tronMainnet, amount: 0n, account: ADDRESS };
const claimRewardsFee = await sdk.estimateFee(claimRewards);
const claimRewardsSigned = await sdk.sign({ transaction: claimRewards, fee: claimRewardsFee, nonce: 0, privateKey });
await sdk.broadcast(chains.tronMainnet, claimRewardsSigned);
```

See the full runnable flow with logging and delegation-state assertions in [`examples/tron-native-staking-sample.ts`](../../examples/tron-native-staking-sample.ts).

---

## Signing Flows

See the [main README signing flows diagram](../../README.md#signing-flows) for a visual reference of the direct and MPC signing paths.

Tron signs the `txID` — `SHA256(raw_data)` — with a single **secp256k1** key (not Ed25519 like Cardano, and not the same curve BSC keys are typically stored on but the same key format as EVM chains).

---

## Logging

Logging is opt-in — pass a `logger` to `tron()` to enable it:

```typescript
import { ConsoleLogger } from "@guardian-sdk/sdk";
import { tron } from "@guardian-sdk/tron";

const sdk = new GuardianSDK([
  tron({
    rpcUrl: "https://<your-tron-fullnode>",
    logger: new ConsoleLogger("debug"),
  }),
]);
```

See the [main README Logging section](../../README.md#logging) for full details.

> Private keys and signatures are **never** logged at any level.

---

## Error Handling

Every error thrown by the SDK extends `GuardianError`. See the [main README Error Handling section](../../README.md#error-handling) for the catch pattern and base class reference.

| Code | Thrown when |
|---|---|
| `INVALID_AMOUNT` | Freeze below 1 TRX, `isMaxAmount: true` on `Delegate`/`Undelegate` (unsupported — pass an exact amount), vote not a whole number of TRX, over-voting, or unfreeze exceeding frozen balance |
| `INVALID_RESOURCE` | `Undelegate`/fee estimation with a missing or invalid `resource` (must be `"BANDWIDTH"` or `"ENERGY"`) |
| `UNSUPPORTED_OPERATION` | Voting for an unknown Super Representative |
| `INVALID_SIGNING_ARGS` | Missing `privateKey`/`account`, or `compile()` called without `signArgs._rawTx` from `prehash()` |

---

## Supported Chains

```typescript
import { chains } from "@guardian-sdk/tron";
```

| Chain | Symbol | Explorer |
|---|---|---|
| Tron Mainnet | TRX | https://tronscan.org |

---

← Back to [Guardian SDK](../../README.md)
