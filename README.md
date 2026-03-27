<p align="center">
  <img src="./Logo.png" alt="Guardian SDK" width="500" />
</p>

The **Guardian SDK** is a modular, chain-agnostic staking SDK for TypeScript. It is structured as a multi-package monorepo: a chain-agnostic core (`@guardian/sdk`) and one package per supported chain. Install only the chain you need.

## Table of Contents

- [Packages](#packages)
- [How it works](#how-it-works)
- [Staking API](#staking-api)
  - [getValidators](#getvalidatorschain)
  - [getDelegations](#getdelegationschain-address)
  - [getBalances](#getbalanceschain-address)
  - [getNonce](#getnoncechain-address)
  - [estimateFee](#estimatefeetransaction)
  - [sign](#signsigningargs)
  - [preHash / compile](#prehashhargs--compileargs)
- [Sample — Delegate on BNB Smart Chain](#sample--delegate-on-bnb-smart-chain)
- [Signing Flows](#signing-flows)
- [Error Handling](#error-handling)
  - [ValidationError](#validationerror)
  - [ConfigError](#configerror)
  - [SigningError](#signingerror)
- [Roadmap](#roadmap)

---

## Packages

| Package | Chain | Status | Docs |
|---|---|---|---|
| [`@guardian/bsc`](./packages/bsc/README.md) | BNB Smart Chain | Available | [README](./packages/bsc/README.md) |
| `@guardian/tron` | Tron | In Progress | — |
| `@guardian/sui` | SUI | Planned | — |
| `@guardian/solana` | Solana | Planned | — |
| `@guardian/aptos` | Aptos | Planned | — |
| `@guardian/cardano` | Cardano | Planned | — |

Each chain ships as an independent package — install only what you need, your bundle never pays for chains you don't use. `@guardian/sdk` is included automatically as a dependency of each chain package.

---

## How it works

Install the chain package you need, then pass its factory to `GuardianSDK`:

```typescript
import { GuardianSDK } from "@guardian/sdk";
import { bsc, BSC_CHAIN } from "@guardian/bsc";

const sdk = new GuardianSDK([
  bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
]);
```

Adding another chain later is just adding another entry to the array:

```typescript
import { GuardianSDK } from "@guardian/sdk";
import { bsc, BSC_CHAIN } from "@guardian/bsc";
import { tron, TRON_CHAIN } from "@guardian/tron"; // when available

const sdk = new GuardianSDK([
  bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
  tron({ rpcUrl: "https://api.trongrid.io" }),
]);
```

No chain IDs to configure manually, no internal wiring — install the package, pass the factory, done.

---

## Staking API

The same API surface is available on every supported chain. Pass the chain object as the first argument to scope each call.

### `getValidators(chain)`

Returns all validators on the network — active, inactive, and jailed.

**Returns:** `Promise<Validator[]>`

```typescript
interface Validator {
  id: string;
  name: string;
  description: string;
  image: string | undefined;
  status: ValidatorStatus;      // Active | Inactive | Jailed
  apy: number;                  // Annual percentage yield (%)
  delegators: number;
  operatorAddress: string;
  creditAddress: string;
}
```

```typescript
const validators = await sdk.getValidators(BSC_CHAIN);
// validators[0] → { name, apy, status, operatorAddress, ... }
```

> Validator data is cached for 3 minutes.

---

### `getDelegations(chain, address)`

Returns all delegations for an address and a protocol-level staking summary.

**Returns:** `Promise<Delegations>`

```typescript
interface Delegations {
  delegations: Delegation[];
  stakingSummary: StakingSummary;
}

interface Delegation {
  id: string;
  validator: Validator;
  amount: bigint;               // Current value in wei
  status: DelegationStatus;    // Active | Pending | Claimable | Inactive
  delegationIndex: number;     // Required for Claim transactions
  pendingUntil: number;        // Unix timestamp (ms) when unbonding completes
}

interface StakingSummary {
  totalProtocolStake: number;
  maxApy: number;
  minAmountToStake: bigint;      // In wei
  unboundPeriodInMillis: number;
  redelegateFeeRate: number;
  activeValidators: number;
  totalValidators: number;
}
```

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(BSC_CHAIN, "0xYourAddress");

console.log(stakingSummary.maxApy);           // best APY across all validators
console.log(stakingSummary.minAmountToStake); // minimum stake in wei

for (const d of delegations) {
  console.log(d.validator.name, d.amount, d.status);
}
```

---

### `getBalances(chain, address)`

Returns the four balance categories for an address.

**Returns:** `Promise<Balance[]>`

```typescript
interface Balance {
  type: BalanceType;
  amount: bigint;   // In wei
}

enum BalanceType {
  Available = "Available",  // Wallet balance, immediately spendable
  Staked    = "Staked",     // Delegated and earning rewards
  Pending   = "Pending",    // In the unbonding window
  Claimable = "Claimable",  // Unbonding complete, ready to withdraw
}
```

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

### `getNonce(chain, address)`

Returns the current transaction nonce for an address. Required before calling `sign` or `preHash`.

**Returns:** `Promise<number>`

```typescript
const nonce = await sdk.getNonce(BSC_CHAIN, "0xYourAddress");
```

---

### `estimateFee(transaction)`

Simulates a transaction on-chain and returns the estimated gas fee.

**Returns:** `Promise<Fee>`

```typescript
interface GasFee {
  type: FeeType.GasFee;
  gasPrice: bigint;   // In wei
  gasLimit: bigint;
  total: bigint;      // gasPrice × gasLimit, in wei
}
```

```typescript
import { TransactionType } from "@guardian/bsc";
import { parseEther } from "viem";

const fee = await sdk.estimateFee({
  type: TransactionType.Delegate,
  chain: BSC_CHAIN,
  amount: parseEther("1"),
  account: "0xYourAddress",
  isMaxAmount: false,
  validator: validators[0],
});

console.log(fee.gasPrice, fee.gasLimit, fee.total);
```

Transaction types: `Delegate`, `Undelegate`, `Redelegate`, `Claim`. See the [BSC README](./packages/bsc/README.md#estimatefee) for the full shape of each.

---

### `sign(signingArgs)`

Signs a transaction and returns the raw hex string ready to broadcast.

**Returns:** `Promise<string>`

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
  privateKey: "0xYourPrivateKey", // or pass a viem `account` object
});

// rawTx → broadcast via your RPC node
```

---

### `preHash(args)` / `compile(args)`

For MPC wallets, hardware wallets, or any setup where the private key is not directly available.

**`preHash` returns:** `Promise<PrehashResult>`

```typescript
interface PrehashResult {
  serializedTransaction: string;  // Hex-encoded transaction to send to the external signer
  signArgs: BaseSignArgs;         // Passed through to compile()
}
```

**`compile` returns:** `Promise<string>` — the final signed raw transaction.

```typescript
// Step 1 — serialize
const { serializedTransaction, signArgs } = await sdk.preHash({
  transaction: { type: TransactionType.Delegate, chain: BSC_CHAIN, ... },
  fee,
  nonce,
});

// Send serializedTransaction to your external signer → get back r, s, v

// Step 2 — assemble
const rawTx = await sdk.compile({ signArgs, r: "0x...", s: "0x...", v: 27n });
```

---

## Sample — Delegate on BNB Smart Chain

End-to-end example using direct signing:

```typescript
import { GuardianSDK } from "@guardian/sdk";
import { bsc, BSC_CHAIN, TransactionType } from "@guardian/bsc";
import { parseEther, formatEther } from "viem";

const sdk = new GuardianSDK([
  bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" }),
]);

const ADDRESS = "0xYourAddress";
const PRIVATE_KEY = "0xYourPrivateKey";

// 1. Pick a validator
const validators = await sdk.getValidators(BSC_CHAIN);
const validator = validators.find((v) => v.name === "TWStaking")!;
console.log(`Staking with ${validator.name} — APY: ${validator.apy}%`);

// 2. Check available balance
const balances = await sdk.getBalances(BSC_CHAIN, ADDRESS);
const available = balances.find((b) => b.type === "Available")!;
console.log(`Available: ${formatEther(available.amount)} BNB`);

// 3. Estimate fee
const amount = parseEther("1");
const fee = await sdk.estimateFee({
  type: TransactionType.Delegate,
  chain: BSC_CHAIN,
  amount,
  account: ADDRESS,
  isMaxAmount: false,
  validator,
});
console.log(`Estimated fee: ${formatEther(fee.total)} BNB`);

// 4. Sign
const nonce = await sdk.getNonce(BSC_CHAIN, ADDRESS);
const rawTx = await sdk.sign({
  transaction: {
    type: TransactionType.Delegate,
    chain: BSC_CHAIN,
    amount,
    isMaxAmount: false,
    validator,
  },
  fee,
  nonce,
  privateKey: PRIVATE_KEY,
});

console.log("Signed tx:", rawTx);
// → broadcast rawTx via your RPC node
```

For chain-specific details (protocol parameters, transaction shapes, error codes) see:

- [BNB Smart Chain →](./packages/bsc/README.md)

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

The MPC flow is designed for setups where the private key is managed externally — hardware wallets, MPC servers, or custodians. `preHash()` serializes the transaction and returns it ready to sign. `compile()` assembles the final signed transaction from the ECDSA components (`r`, `s`, `v`).

---

## Error Handling

Every error thrown by the SDK extends `GuardianError`. Each subclass carries a `code` (machine-readable) and `message` (human-readable).

```typescript
import { GuardianError, ValidationError, ConfigError, SigningError } from "@guardian/bsc";

try {
  await sdk.getDelegations(BSC_CHAIN, address);
} catch (err) {
  if (err instanceof ValidationError) {
    // invalid input — caught before any network call
    console.error(err.code, err.message);
  } else if (err instanceof ConfigError) {
    // misconfigured SDK or unsupported chain
    console.error(err.code, err.message);
  } else if (err instanceof SigningError) {
    // signing failed
    console.error(err.code, err.message);
  } else if (err instanceof GuardianError) {
    // catch-all for any SDK error
    console.error(err.code, err.message);
  } else {
    throw err;
  }
}
```

Every `GuardianError` exposes:

| Property | Type | Description |
|---|---|---|
| `message` | `string` | Human-readable description |
| `code` | `string` | Machine-readable error code |
| `name` | `string` | Class name (`"ValidationError"`, `"ConfigError"`, `"SigningError"`) |

---

### `ValidationError`

Thrown when the caller provides invalid input. Always caught before any network call is made.

```typescript
import { ValidationError, ValidationErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_ADDRESS` | An address fails the chain's format check — applies to `getDelegations`, `getBalances`, `getNonce`, and any address field inside a transaction |
| `INVALID_AMOUNT` | A transaction `amount` is zero or negative (Claim transactions are exempt) |
| `INVALID_NONCE` | The `nonce` passed to `sign`, `preHash`, or `compile` is negative or not an integer |
| `INVALID_FEE` | The `fee.gasLimit` or `fee.gasPrice` passed to `sign`, `preHash`, or `compile` is zero or negative |

---

### `ConfigError`

Thrown when the SDK is misconfigured or asked to operate on an unsupported chain.

```typescript
import { ConfigError, ConfigErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `UNSUPPORTED_CHAIN` | The chain passed to any method has no registered service — check that you passed it to the `GuardianSDK` constructor |

---

### `SigningError`

Thrown during transaction signing when arguments are invalid or the transaction type has no implementation.

```typescript
import { SigningError, SigningErrorCode } from "@guardian/bsc";
```

| Code | Thrown when |
|---|---|
| `INVALID_SIGNING_ARGS` | The object passed to `sign()` contains neither a `privateKey` nor an `account` field |
| `UNSUPPORTED_TRANSACTION_TYPE` | A `TransactionType` is used that has no ABI encoding defined |

---

## Roadmap

### Chain support

Planned integrations follow the same architecture — each chain is an independent package implementing the `GuardianServiceContract` interface from `@guardian/sdk`.

| Chain | Package | Status |
|---|---|---|
| BNB Smart Chain | [`@guardian/bsc`](./packages/bsc/README.md) | Available |
| Tron | `@guardian/tron` | In Progress |
| SUI | `@guardian/sui` | Planned |
| Solana | `@guardian/solana` | Planned |
| Aptos | `@guardian/aptos` | Planned |
| Cardano | `@guardian/cardano` | Planned |

### Beyond native staking

The `@guardian/sdk` core is protocol-agnostic by design. Future releases may expand into other DeFi primitives — liquidity provisioning, lending, yield aggregation — expanding the chain-agnostic interfaces and signing flows.
