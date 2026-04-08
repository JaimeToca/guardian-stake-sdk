# @guardian-sdk/bsc — BNB Smart Chain

Native staking support for BNB Smart Chain, part of the [Guardian SDK](../../README.md).

Abstracts low-level contract calls and RPC interactions behind a clean, type-safe API so you can build staking features without dealing with ABI encoding, multicall batching, or BSC-specifics.

## Table of Contents

- [How BNB Native Staking Works](#how-bnb-native-staking-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Reference](#api-reference)
  - [getValidators](#getvalidators)
  - [getDelegations](#getdelegations)
  - [getBalances](#getbalances)
  - [getNonce](#getnonce)
  - [estimateFee](#estimatefee)
  - [sign](#sign)
  - [preHash / compile](#prehash--compile)
  - [broadcast](#broadcast)
- [Signing Flows](#signing-flows)
- [Logging](#logging)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)

---

## How BNB Native Staking Works

BNB Smart Chain uses **Proof-of-Staked-Authority (PoSA)** — a hybrid consensus model where validators are elected based on the amount of BNB staked with them. BNB holders can delegate their tokens to validators to participate in network security and earn a share of block rewards.

### Contract Architecture

BNB native staking is split across two contract layers:

**StakeHub** (`0x0000000000000000000000000000000000002002`) is the entry point for all staking operations. It is a system genesis contract — hardcoded into the BSC protocol — and handles validator registration, delegation routing, unbonding queues, slashing, and reward distribution. All `delegate`, `undelegate`, `redelegate`, and `claim` transactions go to this address.

**StakeCredit** — each validator has its own dedicated credit contract deployed by StakeHub at registration time. These contracts hold the delegated BNB and manage the share accounting for their validator. The credit contract address is available on every `Validator` object as `creditAddress`.

```
  Your Application
        │
        ▼
  @guardian-sdk/bsc SDK
        │
        ├── writes (signed legacy tx) ──────────────────────────► StakeHub
        │   delegate / undelegate / redelegate / claim            0x0000...2002
        │                                                              │
        │                                               deploys at registration
        │                                                              │
        │                                                              ▼
        └── reads (multicall) ───────────────────────────────► StakeCredit
            getPooledBNB / pendingUnbondRequest / unbondRequest  (one per validator)
```

The SDK talks to both layers: write operations go through `StakeHub`, and read operations (`getPooledBNB`, `pendingUnbondRequest`, `unbondRequest`) query the per-validator `StakeCredit` contracts directly via multicall.

### Validators

The validator set has grown beyond the original 45-slot design. As of early 2026, the network registers **50+ validators** in total. The active set is still capped by the protocol, ranked by total staked BNB:

- **Top 21 (Cabinet)** — primary block producers, earn the highest rewards
- **Candidates** — occasional block producers, fill slots above position 21
- **Inactive / Jailed** — registered on-chain but not producing blocks

`getValidators()` returns all registered validators — active, inactive, and jailed. Pass an optional status (or array of statuses) to filter: `getValidators(bscMainnet, "Active")`.

Elections run daily after 00:00 UTC. Each validator sets a **commission rate** — the percentage of block rewards they keep before distributing the rest to delegators. The full validator metadata available on-chain includes moniker, identity, website, details, consensus address, vote address, commission rate, and election info — the SDK surfaces the subset most relevant to delegation UIs.

### Staking Credits and Shares

When you delegate BNB to a validator, the `StakeCredit` contract mints **shares** representing your proportional stake. These shares:

- Are **non-transferable** and specific to each validator
- **Auto-compound** — their BNB value grows as the validator earns block rewards, without any action required
- Are burned when you undelegate

Your BNB value at any point is calculated as:

```
Your BNB = (your shares × total pooled BNB) ÷ total share supply
```

Because rewards continuously accrue, the **share:BNB ratio drifts over time** — 1 share is worth slightly more BNB each day. This has a direct impact on `undelegate` and `redelegate` transactions: the contract takes a `uint256 shares` argument, not a BNB amount. The SDK handles this conversion internally — you always pass a BNB amount in wei, and the SDK queries the `StakeCredit` contract to resolve the correct share count before encoding the transaction.

```
  You pass                SDK                      Contract call                  Encoded in tx
  ─────────────────────────────────────────────────────────────────────────────────────────────
  amount (BNB wei)  ──►  @guardian-sdk/bsc  ──►  StakeCredit.getSharesByPooledBNB()  ──►  shares
  parseEther("5")                             (per-validator credit contract)          uint256
```

To read the current BNB value of a delegated position, the SDK calls `getPooledBNB(delegatorAddress)` on the `StakeCredit` contract, which returns the current BNB equivalent. This is what `getDelegations()` exposes as `delegation.amount`.

### Governance Voting Power

Both `delegate` and `redelegate` accept a `bool delegateVotePower` parameter. When set to `true`, the delegated BNB counts toward the validator's governance voting weight in on-chain proposals. The SDK always sets this to `false` — staking rewards are identical regardless, and governance participation is typically handled separately.

### Lifecycle of a Stake

```
                                    redelegate()
                              ┌─────────────────────┐
                              │                      ▼
  delegate() ──► [ Active ]   │             [ Active — new validator ]
                      │       │
                 undelegate() ┘
                      │
                      ▼
                 [ Pending ]  ── 7 days pass ──►  [ Claimable ]  ── claim() ──►  BNB in wallet
```

| Stage | Description |
|---|---|
| **Active** | BNB is delegated and earning auto-compounding rewards via the StakeCredit contract |
| **Pending** | Unbonding initiated — a 7-day lock is enforced before funds are accessible |
| **Claimable** | Unbonding complete, BNB is held in the StakeCredit contract and ready to withdraw |

Each `undelegate` call creates a numbered **unbond request** on the `StakeCredit` contract, indexed from 0. The index is what `Delegation.delegationIndex` tracks, and it is the value you pass as `index` when building a `ClaimTransaction`. A single address can have multiple concurrent unbond requests against the same validator, each with its own index and unlock time.

> **Single claim only:** The SDK currently supports `claim(address, uint256)` — one unbond request per transaction. The contract also exposes `claimBatch(address[], uint256[])` for claiming multiple requests in one transaction, but this is not yet supported. To claim multiple positions, submit one `ClaimTransaction` per `delegationIndex`.

### Fee Model

BSC staking transactions use the **legacy (pre-EIP-1559) gas model**. The total fee is:

```
fee = gasPrice × gasUsed
```

- The gas price is a **network-enforced floor** — validators reject transactions below the minimum (currently 1 Gwei on mainnet). There is no tip or priority fee mechanism.
- **EIP-1559 type-2 transactions cannot be used** — `StakeHub` is a system contract running inside the consensus layer and rejects `maxFeePerGas`/`maxPriorityFeePerGas` style transactions. All staking transactions must be legacy type-0.
- **Gas price cannot be bumped after broadcast** — BSC does not support replace-by-fee (RBF). Once a staking transaction is submitted you cannot accelerate it by resubmitting with a higher gas price.

Typical gas usage observed on mainnet:

| Operation | Gas Used | Notes |
|---|---|---|
| Delegate | ~269,000 | Scales slightly with validator count |
| Undelegate | ~331,000 | Creates an unbond request entry |
| Redelegate | ~405,000 | Highest cost — burns and re-mints shares across two credit contracts |
| Claim | ~70,000 | Cheapest operation |

The SDK adds a **15% buffer** on top of the simulated gas estimate to reduce the risk of out-of-gas failures.

**Real transaction examples on BSC mainnet:**

| Operation | BSCScan |
|---|---|
| Delegate | [0x1c255c...](https://bscscan.com/tx/0x1c255ca858b7adaf826b6ede919d91292712866b6a6879406672038cc6919cb0) |
| Undelegate | [0x7fa095...](https://bscscan.com/tx/0x7fa095c5308f415a9b54d1f99e58d65475704f6dba8520faa63ae87aa82226bc) |
| Redelegate | [0xfa5135...](https://bscscan.com/tx/0xfa513546ace1fe31e9e8bd856ccb30bfd73135cf09b8a64f8d0f3bff77c339a2) |

### Key Protocol Parameters

| Parameter | Value |
|---|---|
| Unbonding period | 7 days |
| Redelegation fee | 0.002% of redelegated amount, deducted in shares |
| Min delegation amount | 1 BNB |
| Min validator self-stake | 2,000 BNB |
| Validator election cadence | Daily at 00:00 UTC |
| Registered validators | 53 (as of early 2026, growing beyond the original 45-slot design) |
| StakeHub contract | [`0x0000000000000000000000000000000000002002`](https://bscscan.com/address/0x0000000000000000000000000000000000002002) |
| Mainnet chain ID | 56 |
| Mainnet staking UI | https://www.bnbchain.org/en/bnb-staking |
| Testnet staking UI | https://testnet-staking.bnbchain.org/en/bnb-staking |

### Slashing

Validators can be penalised for misbehaviour. Slashing reduces the total pooled BNB in the validator's `StakeCredit` contract, which means all delegators absorb the loss proportionally through a lower share:BNB ratio.

| Offence | Slash | Jail duration |
|---|---|---|
| Double-signing | 200 BNB | 30 days |
| Malicious fast-finality vote | 200 BNB | 30 days |
| Downtime (150+ missed blocks/day) | 10 BNB | 2 days |

Jailed validators cannot receive new delegations. Existing delegations remain active but earn no rewards until the validator is unjailed. You can redelegate away from a jailed validator at any time without waiting for the unbonding period.

---

## Installation

```bash
npm install @guardian-sdk/bsc viem
```

`@guardian-sdk/sdk` is included automatically as a dependency of `@guardian-sdk/bsc`. `viem` is a peer dependency — if your project already uses it, the same instance will be shared.

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian-sdk/sdk";
import { bsc, chains } from "@guardian-sdk/bsc";
import { formatEther, parseEther } from "viem";

const sdk = new GuardianSDK([
  bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
]);

const ADDRESS = "0xYourAddress";

// 1. Fetch all validators
const validators = await sdk.getValidators(chains.bscMainnet);
console.log(`${validators.length} validators found`);

// 2. Fetch delegations for an address
const { delegations, stakingSummary } = await sdk.getDelegations(chains.bscMainnet, ADDRESS);
console.log(`${delegations.length} delegations, max APY: ${stakingSummary.maxApy}%`);

// 3. Fetch balances
const balances = await sdk.getBalances(chains.bscMainnet, ADDRESS);
for (const balance of balances) {
  console.log(balance.type, formatEther(balance.amount), "BNB");
}
// Available  1.5 BNB
// Staked     10.0 BNB
// Pending    2.0 BNB
// Claimable  0.5 BNB

// 4. Estimate fee for a delegation
const fee = await sdk.estimateFee({
  type: "Delegate",
  chain: chains.bscMainnet,
  amount: parseEther("1"),
  account: ADDRESS,
  isMaxAmount: false,
  validator: validators[0],
});

// 5. Get nonce
const nonce = await sdk.getNonce(chains.bscMainnet, ADDRESS);

// 6. Sign
const rawTx = await sdk.sign({
  transaction: {
    type: "Delegate",
    chain: chains.bscMainnet,
    amount: parseEther("1"),
    isMaxAmount: false,
    validator: validators[0],
  },
  fee,
  nonce,
  privateKey: "0xYourPrivateKey",
});

// 7. Broadcast
const txHash = await sdk.broadcast(chains.bscMainnet, rawTx);
console.log(`Transaction hash: ${txHash}`);
```

---

## API Reference

### `getValidators`

Returns all validators registered on the protocol — active, inactive, and jailed. Pass an optional status filter to narrow the result.

```typescript
// All validators
const validators = await sdk.getValidators(chains.bscMainnet);

// Only active validators
const active = await sdk.getValidators(chains.bscMainnet, "Active");

// Active and jailed
const subset = await sdk.getValidators(chains.bscMainnet, ["Active", "Jailed"]);
```

**Returns:** `Promise<Validator[]>`

```typescript
interface Validator {
  id: string;                  // Unique identifier
  status: ValidatorStatus;     // Active | Inactive | Jailed
  name: string;                // Human-readable name
  description: string;
  image: string | undefined;   // Logo URL
  apy: number;                 // Annual percentage yield (%)
  delegators: number;          // Total number of delegators
  operatorAddress: string;     // Validator operator address
  creditAddress: string;       // Per-validator credit contract address
}

type ValidatorStatus = "Active" | "Inactive" | "Jailed";
```

> **Caching:** Validator data is cached in memory for the lifetime of the SDK instance. Validators are a slowly-changing set — elections run once per day at most — so cache invalidation is rarely needed in practice.

> **On-chain data not surfaced here:** The `StakeHub` contract exposes additional per-validator data via `getValidatorCommission`, `getValidatorDescription`, `getValidatorRewardRecord`, `getValidatorElectionInfo`, and `getValidatorConsensusAddress`. These are available for direct RPC calls if your application needs them.

---

### `getDelegations`

Returns all delegations for a given address, along with a summary of the staking protocol.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(
  chains.bscMainnet,
  "0xYourAddress"
);
```

**Returns:** `Promise<Delegations>`

```typescript
interface Delegations {
  delegations: Delegation[];
  stakingSummary: StakingSummary;
}

interface Delegation {
  id: string;
  validator: Validator;
  amount: bigint;              // Current BNB value of the position, in wei (from getPooledBNB)
  status: DelegationStatus;   // Active | Pending | Claimable | Inactive
  delegationIndex: bigint;    // Unbond request index — pass as `index` in ClaimTransaction
                               // Active delegations have delegationIndex: -1n
  pendingUntil: number;       // Unix timestamp (ms) when unbonding completes; 0 if claimable
}

// status: "Active"    — Staked and earning auto-compounding rewards
//         "Pending"   — In the 7-day unbonding window — not yet withdrawable
//         "Claimable" — Unbonding complete — BNB held in StakeCredit, ready to claim
//         "Inactive"
type DelegationStatus = "Active" | "Pending" | "Claimable" | "Inactive";

interface StakingSummary {
  totalProtocolStake: number;     // Total BNB staked across all validators
  maxApy: number;                 // Best APY across all active validators
  minAmountToStake: bigint;       // Protocol minimum — currently 1 BNB (in wei)
  unboundPeriodInMillis: number;  // 604800000 (7 days)
  redelegateFeeRate: number;      // 0.002 — deducted in shares from the source position
  activeValidators: number;
  totalValidators: number;
}
```

> `delegation.amount` is the **BNB value** of the position (result of `getPooledBNB` on the `StakeCredit` contract). You can pass it directly as `amount` in `Undelegate` and `Redelegate` transactions — the SDK resolves the share equivalent internally before encoding the contract call.

---

### `getBalances`

Returns the four balance categories for a given address — useful for displaying a portfolio overview.

```typescript
const balances = await sdk.getBalances(chains.bscMainnet, "0xYourAddress");
```

**Returns:** `Promise<Balance[]>`

```typescript
type BalanceType = "Available" | "Staked" | "Pending" | "Claimable";
// Available  — Wallet balance, immediately spendable
// Staked     — Currently delegated and earning rewards
// Pending    — In the 7-day unbonding window
// Claimable  — Unbonding complete, ready to claim
```

Example:

```typescript
import { formatEther } from "viem";

const balances = await sdk.getBalances(chains.bscMainnet, "0xYourAddress");

for (const balance of balances) {
  console.log(balance.type, formatEther(balance.amount));
}
// Available  1.5
// Staked     10.0
// Pending    2.0
// Claimable  0.5
```

---

### `getNonce`

Returns the current transaction nonce for an address. Required when building signing arguments.

```typescript
const nonce = await sdk.getNonce(chains.bscMainnet, "0xYourAddress");
```

---

### `estimateFee`

Simulates a transaction against the chain to estimate gas price and gas limit.

```typescript
const fee = await sdk.estimateFee(transaction);
```

**Returns:** `Promise<Fee>`

```typescript
interface GasFee {
  type: "GasFee";
  gasPrice: bigint;   // In wei
  gasLimit: bigint;
  total: bigint;      // gasPrice × gasLimit, in wei
}
```

Accepts any of the four transaction types:

```typescript
// Delegate — stake BNB with a validator
// `amount` is BNB in wei, sent as transaction value to StakeHub
const fee = await sdk.estimateFee({
  type: "Delegate",
  chain: chains.bscMainnet,
  amount: parseEther("5"),
  account: "0xYourAddress",
  isMaxAmount: false,
  validator: validators[0],
});

// Undelegate — begin the 7-day unbonding process
// `amount` is BNB in wei — the SDK converts to shares internally before encoding
const fee = await sdk.estimateFee({
  type: "Undelegate",
  chain: chains.bscMainnet,
  amount: parseEther("5"),    // BNB in wei
  account: "0xYourAddress",
  isMaxAmount: false,
  validator: validators[0],
});

// Redelegate — move stake from one validator to another (0.002% fee applies)
// `amount` is BNB in wei — the SDK converts to shares on the source validator internally
const fee = await sdk.estimateFee({
  type: "Redelegate",
  chain: chains.bscMainnet,
  amount: parseEther("5"),    // BNB in wei
  account: "0xYourAddress",
  isMaxAmount: false,
  fromValidator: validators[0],
  toValidator: validators[1],
});

// Claim — withdraw BNB for a single unbond request after the unbonding period completes.
// `index` is the unbond request number from delegation.delegationIndex.
// To claim multiple positions, submit one ClaimTransaction per delegationIndex.
const fee = await sdk.estimateFee({
  type: "Claim",
  chain: chains.bscMainnet,
  amount: 0n,
  account: "0xYourAddress",
  validator: validators[0],
  index: delegation.delegationIndex,
});
```

---

### `sign`

Signs a transaction and returns the raw hex string ready to broadcast.

**With a private key:**

```typescript
const rawTx = await sdk.sign({
  transaction: {
    type: "Delegate",
    chain: chains.bscMainnet,
    amount: parseEther("1"),
    isMaxAmount: false,
    validator: validators[0],
  },
  fee,
  nonce,
  privateKey: "0xYourPrivateKey",
});
```

**With a viem account object:**

```typescript
import { privateKeyToAccount } from "viem/accounts";

const account = privateKeyToAccount("0xYourPrivateKey");

const rawTx = await sdk.sign({
  transaction: { ... },
  fee,
  nonce,
  account,
});
```

---

### `preHash` / `compile`

For **MPC wallets, hardware wallets, or any setup where the private key is not directly available**. Splits signing into two steps:

```
  Your App                  SDK                  External Signer          BSC Node
                                                 (MPC / HSM / HW)
     │                       │                        │                      │
     │  preHash(tx, fee,     │                        │                      │
     │    nonce)             │                        │                      │
     │ ─────────────────────►│                        │                      │
     │                       │                        │                      │
     │  { serializedTx,      │                        │                      │
     │    signArgs }         │                        │                      │
     │ ◄─────────────────────│                        │                      │
     │                       │                        │                      │
     │  serializedTx         │                        │                      │
     │ ──────────────────────────────────────────────►│                      │
     │                       │                        │                      │
     │  signature (hex)      │                        │                      │
     │ ◄──────────────────────────────────────────────│                      │
     │                       │                        │                      │
     │  compile({ signArgs,  │                        │                      │
     │    signature })       │                        │                      │
     │ ─────────────────────►│                        │                      │
     │                       │                        │                      │
     │  rawTx (signed hex)   │                        │                      │
     │ ◄─────────────────────│                        │                      │
     │                       │                        │                      │
     │  broadcast rawTx      │                        │                      │
     │ ────────────────────────────────────────────────────────────────────► │
     │                       │                        │                      │
     │  txHash               │                        │                      │
     │ ◄──────────────────────────────────────────────────────────────────── │
```

**Step 1 — serialize the transaction:**

```typescript
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction: {
    type: "Delegate",
    chain: chains.bscMainnet,
    amount: parseEther("1"),
    isMaxAmount: false,
    validator: validators[0],
  },
  fee,
  nonce,
});

// Send `serializedTransaction` to your MPC server or hardware wallet.
// It returns a hex-encoded ECDSA signature string.
```

**Step 2 — compile the final transaction:**

```typescript
const rawTx = await sdk.compile({
  signArgs,
  signature: "0x<hex-signature>", // raw hex signature from your external signer
});

---

### `broadcast`

Broadcasts a signed raw transaction to the BSC network and returns the transaction hash.

```typescript
const txHash = await sdk.broadcast(chains.bscMainnet, rawTx);
console.log(`Transaction hash: ${txHash}`);
// → https://bscscan.com/tx/${txHash}
```

`rawTx` is the string returned by either `sign()` or `compile()`.

> Once broadcast, BSC transactions cannot be accelerated via replace-by-fee (RBF). See [Fee Model](#fee-model) for details.

---

## Signing Flows

See the [main README signing flows diagram](../../README.md#signing-flows) for a visual reference.

---

## Logging

Logging is opt-in — pass a `logger` to `bsc()` to enable it:

```typescript
import { ConsoleLogger } from "@guardian-sdk/sdk";
import { bsc } from "@guardian-sdk/bsc";

const sdk = new GuardianSDK([
  bsc({
    rpcUrl: "https://bsc-dataseed.bnbchain.org",
    logger: new ConsoleLogger("debug"), // "debug" | "info" | "warn" | "error"
  }),
]);
```

Plug in any logger that implements the `Logger` interface (`debug`, `info`, `warn`, `error` methods). See the [main README Logging section](../../README.md#logging) for full details including bring-your-own-logger examples.

> Private keys and signatures are **never** logged at any level.

---

## Error Handling

Every error thrown by the SDK extends `GuardianError`. See the [main README Error Handling section](../../README.md#error-handling) for the catch pattern and base class reference. BSC-specific codes are listed below.

### `ValidationError`

Thrown when the caller provides invalid input. Caught before any network call is made.

```typescript
import { ValidationError } from "@guardian-sdk/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_ADDRESS` | An address string fails the chain's address format check — e.g. `getDelegations`, `getBalances`, `getNonce`, or a validator/account address inside a transaction |
| `INVALID_AMOUNT` | A `Delegate` transaction `amount` is below the 1 BNB protocol minimum  |
| `INVALID_NONCE` | The `nonce` passed to `sign`, `preHash`, or `compile` is negative or not an integer |
| `INVALID_FEE` | The `fee.gasLimit` or `fee.gasPrice` passed to `sign`, `preHash`, or `compile` is zero or negative |
| `INVALID_PRIVATE_KEY` | The private key passed to `sign()` is not valid hex, is zero, or exceeds the secp256k1 curve order |

---

### `ConfigError`

Thrown when the SDK is misconfigured or asked to operate on a chain it does not support.

```typescript
import { ConfigError } from "@guardian-sdk/bsc";
```

| Code | Thrown when |
|---|---|
| `UNSUPPORTED_CHAIN` | The chain passed to any method has no registered service — check that you passed `bsc(...)` to the `GuardianSDK` constructor |
| `INVALID_RPC_URL` | The `rpcUrl` passed to `bsc()` is not a valid URL or uses an unsupported protocol (must be `http`, `https`, `ws`, or `wss`) |

---

### `SigningError`

Thrown during transaction signing when the signing arguments are invalid or the transaction type is not supported.

```typescript
import { SigningError } from "@guardian-sdk/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_SIGNING_ARGS` | The object passed to `sign()` contains neither a `privateKey` nor an `account` field |
| `UNSUPPORTED_TRANSACTION_TYPE` | `buildCallData` is called with a `TransactionType` that has no ABI encoding defined |

---

### Catching by code

If you only want to handle one specific condition:

```typescript
import { ValidationError } from "@guardian-sdk/bsc";

try {
  await sdk.getBalances(chains.bscMainnet, rawInput);
} catch (err) {
  if (
    err instanceof ValidationError &&
    err.code === "INVALID_ADDRESS"
  ) {
    showAddressError("Please enter a valid wallet address.");
  }
}
```

---

## Supported Chains

Import the chain constant for the network you want to interact with:

```typescript
import { chains } from "@guardian-sdk/bsc";
```

| Chain | Chain ID | Explorer |
|---|---|---|
| BNB Smart Chain Mainnet | 56 | https://bscscan.com |

You can also retrieve all chains supported by the installed packages at runtime:

```typescript
import { getSupportedChains } from "@guardian-sdk/bsc";

const chains = getSupportedChains();
// [{ id: "bsc-mainnet", symbol: "BNB", chainId: "56", ... }]
```

---

← Back to [Guardian SDK](../../README.md)
