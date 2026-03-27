# @guardian/bsc — BNB Smart Chain

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
- [Signing Flows](#signing-flows)
- [Error Handling](#error-handling)
- [Supported Chains](#supported-chains)

---

## How BNB Native Staking Works

BNB Smart Chain uses **Proof-of-Staked-Authority (PoSA)** — a hybrid consensus model where validators are elected based on the amount of BNB staked with them. BNB holders can delegate their tokens to validators to participate in network security and earn a share of block rewards.

### Validators

Up to **45 validators** are active at any time, ranked by total staked BNB:

- **Top 21 (Cabinet)** — primary block producers, earn the highest rewards
- **Positions 22–45 (Candidates)** — occasional block producers
- **Below 45** — inactive, receive no rewards

Elections run daily after 00:00 UTC. Each validator sets a **commission rate** — the percentage of block rewards they keep before distributing the rest to delegators.

### Staking Credits

When you delegate BNB to a validator, you receive **staking credit tokens** unique to that validator (e.g., `stBNB_ValidatorName`). These credits:

- Are **non-transferable** and specific to each validator
- **Auto-compound** — their BNB value grows as the validator earns block rewards
- Are burned when you undelegate

Your BNB value at any point is calculated as:

```
Your BNB = (your credit balance × total pooled BNB) ÷ total credit supply
```

This means you never need to manually claim rewards — your stake simply becomes worth more over time.

### Lifecycle of a Stake

```
Delegate ──► Active (earning rewards)
                │
             Undelegate
                │
                ▼
            Pending (7-day unbonding period)
                │
             Time passes
                │
                ▼
            Claimable ──► Claim ──► BNB returned to wallet
```

| Stage | Description |
|---|---|
| **Active** | BNB is staked and earning auto-compounding rewards |
| **Pending** | Unbonding initiated — 7-day lock before funds are accessible |
| **Claimable** | Unbonding complete, BNB is ready to claim |

### Key Protocol Parameters

| Parameter | Value |
|---|---|
| Unbonding period | 7 days |
| Redelegation fee | 0.002% |
| Min validator self-stake | 2,000 BNB |
| StakeHub contract | `0x0000000000000000000000000000000000002002` |
| Mainnet chain ID | 56 |
| Mainnet staking UI | https://www.bnbchain.org/en/bnb-staking |
| Testnet staking UI | https://testnet-staking.bnbchain.org/en/bnb-staking |

### Slashing

Validators can be penalised for misbehaviour, which affects delegators proportionally:

| Offence | Slash | Jail |
|---|---|---|
| Double-signing | 200 BNB | 30 days |
| Malicious fast-finality vote | 200 BNB | 30 days |
| Downtime (150+ missed blocks/day) | 10 BNB | 2 days |

---

## Installation

```bash
npm install @guardian/bsc viem
```

`@guardian/sdk` is included automatically as a dependency of `@guardian/bsc`. `viem` is a peer dependency — if your project already uses it, the same instance will be shared.

---

## Quick Start

```typescript
import { GuardianSDK } from "@guardian/sdk";
import { bsc, BSC_CHAIN, TransactionType } from "@guardian/bsc";
import { formatEther, parseEther } from "viem";

const sdk = new GuardianSDK([
  bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
]);

const ADDRESS = "0xYourAddress";

// 1. Fetch all validators
const validators = await sdk.getValidators(BSC_CHAIN);
console.log(`${validators.length} validators found`);

// 2. Fetch delegations for an address
const { delegations, stakingSummary } = await sdk.getDelegations(BSC_CHAIN, ADDRESS);
console.log(`${delegations.length} delegations, max APY: ${stakingSummary.maxApy}%`);

// 3. Fetch balances
const balances = await sdk.getBalances(BSC_CHAIN, ADDRESS);
for (const balance of balances) {
  console.log(balance.type, formatEther(balance.amount), "BNB");
}
// Available  1.5 BNB
// Staked     10.0 BNB
// Pending    2.0 BNB
// Claimable  0.5 BNB

// 4. Estimate fee for a delegation
const fee = await sdk.estimateFee({
  type: TransactionType.Delegate,
  chain: BSC_CHAIN,
  amount: parseEther("1"),
  account: ADDRESS,
  isMaxAmount: false,
  validator: validators[0],
});

// 5. Get nonce
const nonce = await sdk.getNonce(BSC_CHAIN, ADDRESS);

// 6. Sign and broadcast
const rawTx = await sdk.sign({
  transaction: {
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount: parseEther("1"),
    isMaxAmount: false,
    validator: validators[0],
  },
  fee,
  nonce,
  privateKey: "0xYourPrivateKey",
});

// rawTx is ready to broadcast via your RPC node
```

---

## API Reference

### `getValidators`

Returns all validators registered on the protocol, including active, inactive, and jailed ones.

```typescript
const validators = await sdk.getValidators(BSC_CHAIN);
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

enum ValidatorStatus {
  Active,
  Inactive,
  Jailed,
}
```

> Validator data is cached for 3 minutes. Validators are a fixed, slowly-changing set — elections run once per day at most.

---

### `getDelegations`

Returns all delegations for a given address, along with a summary of the staking protocol.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(
  BSC_CHAIN,
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
  amount: bigint;              // Current BNB value of credits, in wei
  status: DelegationStatus;   // Active | Pending | Claimable | Inactive
  delegationIndex: number;    // Index of the unbond request — required for claim()
  pendingUntil: number;       // Unix timestamp (ms) when unbonding completes
}

enum DelegationStatus {
  Active,     // Staked and earning
  Pending,    // In the 7-day unbonding window
  Claimable,  // Ready to claim
  Inactive,
}

interface StakingSummary {
  totalProtocolStake: number;
  maxApy: number;
  minAmountToStake: bigint;       // In wei
  unboundPeriodInMillis: number;  // 604800000 (7 days)
  redelegateFeeRate: number;      // 0.002%
  activeValidators: number;
  totalValidators: number;
}
```

---

### `getBalances`

Returns the four balance categories for a given address — useful for displaying a portfolio overview.

```typescript
const balances = await sdk.getBalances(BSC_CHAIN, "0xYourAddress");
```

**Returns:** `Promise<Balance[]>`

```typescript
enum BalanceType {
  Available  = "Available",   // Wallet balance, immediately spendable
  Staked     = "Staked",      // Currently delegated and earning rewards
  Pending    = "Pending",     // In the 7-day unbonding window
  Claimable  = "Claimable",   // Unbonding complete, ready to claim
}
```

Example:

```typescript
import { formatEther } from "viem";

const balances = await sdk.getBalances(BSC_CHAIN, "0xYourAddress");

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
const nonce = await sdk.getNonce(BSC_CHAIN, "0xYourAddress");
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
  type: FeeType.GasFee;
  gasPrice: bigint;   // In wei
  gasLimit: bigint;
  total: bigint;      // gasPrice × gasLimit, in wei
}
```

Accepts any of the four transaction types:

```typescript
// Delegate — stake BNB with a validator
const fee = await sdk.estimateFee({
  type: TransactionType.Delegate,
  chain: BSC_CHAIN,
  amount: parseEther("5"),
  account: "0xYourAddress",
  isMaxAmount: false,
  validator: validators[0],
});

// Undelegate — begin the 7-day unbonding process
const fee = await sdk.estimateFee({
  type: TransactionType.Undelegate,
  chain: BSC_CHAIN,
  amount: parseEther("5"),
  account: "0xYourAddress",
  isMaxAmount: false,
  validator: validators[0],
});

// Redelegate — move stake from one validator to another (0.002% fee applies)
const fee = await sdk.estimateFee({
  type: TransactionType.Redelegate,
  chain: BSC_CHAIN,
  amount: parseEther("5"),
  account: "0xYourAddress",
  isMaxAmount: false,
  fromValidator: validators[0],
  toValidator: validators[1],
});

// Claim — withdraw BNB after the unbonding period completes
const fee = await sdk.estimateFee({
  type: TransactionType.Claim,
  chain: BSC_CHAIN,
  amount: 0n,
  account: "0xYourAddress",
  validator: validators[0],
  index: 0n,    // delegationIndex from getDelegations()
});
```

---

### `sign`

Signs a transaction and returns the raw hex string ready to broadcast.

**With a private key:**

```typescript
const rawTx = await sdk.sign({
  transaction: {
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
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

**Step 1 — serialize the transaction:**

```typescript
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction: {
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount: parseEther("1"),
    isMaxAmount: false,
    validator: validators[0],
  },
  fee,
  nonce,
});

// Send `serializedTransaction` to your MPC server or hardware wallet.
// It returns the ECDSA signature components: r, s, v.
```

**Step 2 — compile the final transaction:**

```typescript
const rawTx = await sdk.compile({
  signArgs,
  r: "0x...",
  s: "0x...",
  v: 27n,
});

// Broadcast rawTx via your RPC node
```

---

## Signing Flows

```
Direct signing (private key available)
──────────────────────────────────────
estimateFee() ──► getNonce() ──► sign() ──► broadcast

MPC / external signing
──────────────────────
estimateFee() ──► getNonce() ──► preHash() ──► [external signer] ──► compile() ──► broadcast
```

---

## Error Handling

Every error thrown by the SDK extends `GuardianError`, so you can catch the base class or narrow to a specific subclass depending on how much detail you need.

```typescript
import {
  GuardianError,
  ValidationError,
  ConfigError,
  SigningError,
} from "@guardian/bsc"; // re-exported from @guardian/sdk

try {
  await sdk.getDelegations(BSC_CHAIN, address);
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.code, err.message);
    // e.g. "INVALID_ADDRESS" "0xbad is not a valid address for chain 56."
  } else if (err instanceof ConfigError) {
    console.error(err.code, err.message);
  } else if (err instanceof SigningError) {
    console.error(err.code, err.message);
  } else if (err instanceof GuardianError) {
    // catch-all for any SDK error
    console.error(err.code, err.message);
  } else {
    throw err; // re-throw anything not from the SDK
  }
}
```

Every `GuardianError` instance exposes:

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable description of what went wrong |
| `code` | `ErrorCode` | Machine-readable code (see tables below) |
| `name` | `string` | Class name (`"ValidationError"`, `"ConfigError"`, `"SigningError"`) |

---

### `ValidationError`

Thrown when the caller provides invalid input. Caught before any network call is made.

```typescript
import { ValidationError, ValidationErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_ADDRESS` | An address string fails the chain's address format check — e.g. `getDelegations`, `getBalances`, `getNonce`, or a validator/account address inside a transaction |
| `INVALID_AMOUNT` | A transaction `amount` is zero or negative (Claim transactions are exempt) |
| `INVALID_NONCE` | The `nonce` passed to `sign`, `preHash`, or `compile` is negative or not an integer |
| `INVALID_FEE` | The `fee.gasLimit` or `fee.gasPrice` passed to `sign`, `preHash`, or `compile` is zero or negative |

---

### `ConfigError`

Thrown when the SDK is misconfigured or asked to operate on a chain it does not support.

```typescript
import { ConfigError, ConfigErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `UNSUPPORTED_CHAIN` | The chain passed to any method has no registered service — check that you passed `bsc(...)` to the `GuardianSDK` constructor |

---

### `SigningError`

Thrown during transaction signing when the signing arguments are invalid or the transaction type is not supported.

```typescript
import { SigningError, SigningErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_SIGNING_ARGS` | The object passed to `sign()` contains neither a `privateKey` nor an `account` field |
| `UNSUPPORTED_TRANSACTION_TYPE` | `buildCallData` is called with a `TransactionType` that has no ABI encoding defined |

---

### Catching by code

If you only want to handle one specific condition:

```typescript
import { ValidationError, ValidationErrorCode } from "@guardian/bsc";

try {
  await sdk.getBalances(BSC_CHAIN, rawInput);
} catch (err) {
  if (
    err instanceof ValidationError &&
    err.code === ValidationErrorCode.INVALID_ADDRESS
  ) {
    showAddressError("Please enter a valid wallet address.");
  }
}
```

---

## Supported Chains

Import the chain constant for the network you want to interact with:

```typescript
import { BSC_CHAIN } from "@guardian/bsc";
```

| Chain | Chain ID | Explorer |
|---|---|---|
| BNB Smart Chain Mainnet | 56 | https://bscscan.com |

You can also retrieve all chains supported by the installed packages at runtime:

```typescript
import { getSupportedChains } from "@guardian/bsc";

const chains = getSupportedChains();
// [{ id: "bsc-mainnet", symbol: "BNB", chainId: "56", ... }]
```

---

← Back to [Guardian SDK](../../README.md)
