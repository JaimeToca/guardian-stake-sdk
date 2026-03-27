<p align="center">
  <img src="./Logo.png" alt="Guardian SDK" width="400" />
</p>

The **Guardian SDK** is a modular, chain-agnostic staking SDK for TypeScript. It is structured as a multi-package monorepo: a chain-agnostic core (`@guardian/sdk`) and one package per supported chain. Install only the chain you need.

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

## How it works

### Initialization

Create one `GuardianSDK` instance and configure each chain you need by its chain ID:

```typescript
import { GuardianSDK } from "@guardian/bsc";

const sdk = new GuardianSDK({
  chains: {
    "56": { rpcUrl: "https://bsc-dataseed.bnbchain.org" }, // BNB Smart Chain
  },
});
```

---

## Staking API

The same API surface is available on every supported chain. Pass the chain object as the first argument to scope each call.

### `getValidators(chain)`

Returns all validators on the network — active, inactive, and jailed.

```typescript
import { GuardianSDK, BSC_CHAIN } from "@guardian/bsc";

const validators = await sdk.getValidators(BSC_CHAIN);
// validators[0] → { name, apy, status, operatorAddress, creditAddress, ... }
```

### `getDelegations(chain, address)`

Returns all delegations for an address and a summary of the staking protocol.

```typescript
const { delegations, stakingSummary } = await sdk.getDelegations(BSC_CHAIN, "0xYourAddress");

console.log(stakingSummary.maxApy);          // best APY across all validators
console.log(stakingSummary.minAmountToStake); // minimum stake in wei

for (const d of delegations) {
  console.log(d.validator.name, d.amount, d.status);
  // status: Active | Pending | Claimable | Inactive
}
```

### `getBalances(chain, address)`

Returns the four balance categories for an address.

```typescript
import { formatEther } from "viem";

const balances = await sdk.getBalances(BSC_CHAIN, "0xYourAddress");

for (const balance of balances) {
  console.log(balance.type, formatEther(balance.amount));
}
// Available  1.5    ← wallet balance, immediately spendable
// Staked     10.0   ← delegated and earning rewards
// Pending    2.0    ← in the unbonding window
// Claimable  0.5    ← unbonding complete, ready to withdraw
```

### `getNonce(chain, address)`

Returns the current transaction nonce. Required before calling `sign` or `preHash`.

```typescript
const nonce = await sdk.getNonce(BSC_CHAIN, "0xYourAddress");
```

### `estimateFee(transaction)`

Simulates a transaction on-chain and returns the estimated gas fee.

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

### `sign(signingArgs)`

Signs a transaction and returns the raw hex string ready to broadcast.

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

### `preHash(args)` / `compile(args)`

For MPC wallets, hardware wallets, or any setup where the private key is not directly available.

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
import { GuardianSDK, BSC_CHAIN, TransactionType } from "@guardian/bsc";
import { parseEther, formatEther } from "viem";

const sdk = new GuardianSDK({
  chains: {
    "56": { rpcUrl: "https://bsc-dataseed.bnbchain.org" },
  },
});

const ADDRESS = "0xYourAddress";
const PRIVATE_KEY = "0xYourPrivateKey";

// 1. Pick a validator
const validators = await sdk.getValidators(BSC_CHAIN);
const validator = validators.find((v) => v.name === "TWStaking")!;
console.log(`Staking with ${validator.name} — APY: ${validator.apy}%`);

// 2. Check balances before
const before = await sdk.getBalances(BSC_CHAIN, ADDRESS);
const available = before.find((b) => b.type === "Available")!;
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

For chain-specific details (transaction types, protocol parameters, error codes) see the chain README:

- [BNB Smart Chain →](./packages/bsc/README.md)

---

## Signing flows

```
Direct signing (private key available)
──────────────────────────────────────
estimateFee() ──► getNonce() ──► sign() ──► broadcast

MPC / external signing
──────────────────────
estimateFee() ──► getNonce() ──► preHash() ──► [external signer] ──► compile() ──► broadcast
```

The MPC flow is designed for setups where the private key is managed externally — hardware wallets, MPC servers, or custodians. `preHash()` serializes the transaction and returns it ready to sign. `compile()` assembles the final signed transaction from the ECDSA components (`r`, `s`, `v`).

### Error handling

Every error thrown by the SDK extends `GuardianError`, exported from each chain package:

```typescript
import { GuardianError, ValidationError, ConfigError, SigningError } from "@guardian/bsc";

try {
  await sdk.getDelegations(chain, address);
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
  } else {
    throw err;
  }
}
```

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

The `@guardian/sdk` core is protocol-agnostic by design. Future releases may expand into other DeFi primitives — liquidity provisioning, lending, yield aggregation — using the same chain-agnostic interfaces and signing flows.
