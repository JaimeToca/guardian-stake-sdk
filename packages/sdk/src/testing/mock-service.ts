import type { GuardianChain } from "../chain";
import { GuardianChainType, ChainEcosystemType } from "../chain";
import type { GuardianServiceContract } from "../service/guardian-service-contract";
import type { Validator, Delegation, Delegations, StakingSummary } from "../service/staking-types";
import { ValidatorStatus, DelegationStatus } from "../service/staking-types";
import type { Balance } from "../service/balance-types";
import { BalanceType } from "../service/balance-types";
import type { Fee } from "../service/fee-types";
import { FeeType } from "../service/fee-types";
import type {
  Transaction,
  DelegateTransaction,
  UndelegateTransaction,
  RedelegateTransaction,
  ClaimTransaction,
} from "../service/transaction-types";
import { TransactionType } from "../service/transaction-types";

// ─── Chain ───────────────────────────────────────────────────────────────────

/** A minimal `GuardianChain` fixture for use in tests. */
export const MOCK_CHAIN: GuardianChain = {
  id: "mock-chain",
  type: GuardianChainType.Smartchain,
  symbol: "MOCK",
  decimals: 18,
  ecosystem: ChainEcosystemType.Ethereum,
  chainId: "0",
  explorer: "",
};

// ─── Service mock ─────────────────────────────────────────────────────────────

/**
 * Returns a fully-typed `GuardianServiceContract` with no-op defaults.
 * Override only the methods relevant to your test.
 *
 * @example
 * ```typescript
 * import { GuardianSDK, createMockService, mockValidator } from "@guardian/sdk";
 * import { BSC_CHAIN } from "@guardian/bsc";
 *
 * const sdk = new GuardianSDK([
 *   createMockService({
 *     getValidators: vi.fn().mockResolvedValue([mockValidator({ apy: 10 })]),
 *   }),
 * ]);
 * ```
 */
export function createMockService(
  overrides: Partial<GuardianServiceContract> = {},
  chain: GuardianChain = MOCK_CHAIN
): GuardianServiceContract {
  return {
    getChainInfo: () => chain,
    getValidators: () => Promise.resolve([]),
    getDelegations: () => Promise.resolve(mockDelegations()),
    getBalances: () => Promise.resolve([]),
    getNonce: () => Promise.resolve(0),
    estimateFee: () => Promise.resolve(mockFee()),
    sign: () => Promise.resolve("0x"),
    prehash: (args) => Promise.resolve({ serializedTransaction: "0x", signArgs: args }),
    compile: () => Promise.resolve("0x"),
    broadcast: () => Promise.resolve("0x"),
    ...overrides,
  };
}

// ─── Staking fixtures ─────────────────────────────────────────────────────────

/**
 * Builds a minimal `Validator` fixture. Override any field as needed.
 *
 * @example
 * ```typescript
 * mockValidator({ name: "Alpha", apy: 12, status: ValidatorStatus.Active })
 * ```
 */
export function mockValidator(overrides: Partial<Validator> = {}): Validator {
  return {
    id: "mock_validator_0",
    status: ValidatorStatus.Active,
    name: "Mock Validator",
    description: "CABINET",
    image: undefined,
    apy: 5,
    delegators: 100,
    operatorAddress: "0x0000000000000000000000000000000000000001",
    creditAddress: "0x0000000000000000000000000000000000000002",
    ...overrides,
  };
}

/**
 * Builds a minimal `Delegation` fixture. Override any field as needed.
 *
 * @example
 * ```typescript
 * mockDelegation({ status: DelegationStatus.Pending, amount: parseEther("5") })
 * ```
 */
export function mockDelegation(overrides: Partial<Delegation> = {}): Delegation {
  return {
    id: "mock_delegation_0",
    validator: mockValidator(),
    amount: BigInt("1000000000000000000"), // 1 token
    status: DelegationStatus.Active,
    delegationIndex: 0n,
    pendingUntil: 0,
    ...overrides,
  };
}

/**
 * Builds a minimal `StakingSummary` fixture. Override any field as needed.
 */
export function mockStakingSummary(overrides: Partial<StakingSummary> = {}): StakingSummary {
  return {
    totalProtocolStake: 1_000_000,
    maxApy: 8,
    minAmountToStake: BigInt("1000000000000000000"), // 1 token
    unboundPeriodInMillis: 604_800_000, // 7 days
    redelegateFeeRate: 0.002,
    activeValidators: 21,
    totalValidators: 45,
    ...overrides,
  };
}

/**
 * Builds a `Delegations` response fixture (delegations array + staking summary).
 *
 * @example
 * ```typescript
 * mockDelegations({
 *   delegations: [mockDelegation({ amount: parseEther("10") })],
 * })
 * ```
 */
export function mockDelegations(overrides: Partial<Delegations> = {}): Delegations {
  return {
    delegations: [],
    stakingSummary: mockStakingSummary(),
    ...overrides,
  };
}

// ─── Balance fixtures ─────────────────────────────────────────────────────────

/**
 * Builds a single `Balance` fixture for the given type.
 *
 * @example
 * ```typescript
 * mockBalance(BalanceType.Staked, { amount: parseEther("10") })
 * ```
 */
export function mockBalance(
  type: BalanceType = BalanceType.Available,
  overrides: { amount?: bigint } = {}
): Balance {
  return { type, amount: overrides.amount ?? BigInt("1000000000000000000") } as Balance;
}

// ─── Fee fixtures ─────────────────────────────────────────────────────────────

/**
 * Builds a minimal `Fee` fixture. Defaults to a realistic BSC gas fee.
 *
 * @example
 * ```typescript
 * mockFee({ gasPrice: parseGwei("3"), gasLimit: 200_000n })
 * ```
 */
export function mockFee(overrides: { gasPrice?: bigint; gasLimit?: bigint } = {}): Fee {
  const gasPrice = overrides.gasPrice ?? 3_000_000_000n; // 3 gwei
  const gasLimit = overrides.gasLimit ?? 150_000n;
  return {
    type: FeeType.GasFee,
    gasPrice,
    gasLimit,
    total: gasPrice * gasLimit,
  };
}

// ─── Transaction fixtures ─────────────────────────────────────────────────────

/**
 * Builds a `DelegateTransaction` fixture.
 *
 * @example
 * ```typescript
 * mockDelegateTransaction({ amount: parseEther("5"), account: "0x123..." })
 * ```
 */
export function mockDelegateTransaction(
  overrides: Partial<DelegateTransaction> = {},
  chain: GuardianChain = MOCK_CHAIN
): DelegateTransaction {
  return {
    type: TransactionType.Delegate,
    chain,
    amount: BigInt("1000000000000000000"),
    isMaxAmount: false,
    validator: mockValidator(),
    ...overrides,
  };
}

/**
 * Builds an `UndelegateTransaction` fixture.
 */
export function mockUndelegateTransaction(
  overrides: Partial<UndelegateTransaction> = {},
  chain: GuardianChain = MOCK_CHAIN
): UndelegateTransaction {
  return {
    type: TransactionType.Undelegate,
    chain,
    amount: BigInt("1000000000000000000"),
    isMaxAmount: false,
    validator: mockValidator(),
    ...overrides,
  };
}

/**
 * Builds a `RedelegateTransaction` fixture.
 */
export function mockRedelegateTransaction(
  overrides: Partial<RedelegateTransaction> = {},
  chain: GuardianChain = MOCK_CHAIN
): RedelegateTransaction {
  return {
    type: TransactionType.Redelegate,
    chain,
    amount: BigInt("1000000000000000000"),
    isMaxAmount: false,
    fromValidator: mockValidator({ id: "from_validator", name: "From Validator" }),
    toValidator: mockValidator({ id: "to_validator", name: "To Validator" }),
    ...overrides,
  };
}

/**
 * Builds a `ClaimTransaction` fixture.
 */
export function mockClaimTransaction(
  overrides: Partial<ClaimTransaction> = {},
  chain: GuardianChain = MOCK_CHAIN
): ClaimTransaction {
  return {
    type: TransactionType.Claim,
    chain,
    amount: 0n,
    validator: mockValidator(),
    index: 0n,
    ...overrides,
  };
}

// Re-export Transaction type so consumers can type their variables without extra imports
export type { Transaction };
