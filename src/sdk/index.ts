import { getChainById, GuardianChain, SUPPORTED_CHAINS } from "../common/chain";
import { provideGuarService } from "../smartchain";
import {
  Balance,
  BaseSignArgs,
  CompileArgs,
  ConfigError,
  ConfigErrorCode,
  Delegations,
  Fee,
  GuardianServiceContract,
  PrehashResult,
  SigningWithPrivateKey,
  Transaction,
  TransactionType,
  ValidationError,
  ValidationErrorCode,
  Validator,
} from "../common";
import { SdkConfig } from "./sdk-config-types";

export * from "./sdk-config-types";

export function getSupportedChains(): GuardianChain[] {
  return SUPPORTED_CHAINS;
}

/**
 * @fileoverview This file defines the `GuardianSDK` class, which serves as the primary
 * interface for interacting with different blockchain. It abstracts away the complexities
 * of blockchain interactions, providing a consistent API for various operations
 * across supported chains.
 *
 * The Guardian SDK is designed to simplify common blockchain tasks such as:
 * - Retrieving information (validators, delegations, balances, nonces).
 * - Estimating transaction fees.
 * - Signing and compiling transactions for broadcast.
 *
 * It manages connections to different blockchain services based on the provided
 * `SdkConfig`, ensuring efficient and type-safe interactions with the
 * underlying decentralized infrastructure.
 */
export class GuardianSDK {
  private initializedServices: Map<string, GuardianServiceContract> = new Map();
  private config: SdkConfig;

  constructor(config: SdkConfig) {
    this.config = config;
  }

  /**
   * Retrieves the list of validators for a given blockchain chain.
   * @param chain The GuardianChain object representing the blockchain.
   * @returns A promise that resolves to an array of Validator objects.
   *
   * The structure of a Validator object is as follows:
   * ```typescript
   * export interface Validator {
   * id: string; // A unique identifier for the validator
   * status: ValidatorStatus; // The current status of the validator (Active, Inactive, Jailed)
   * name: string; // The human-readable name of the validator
   * description: string; // A brief description of the validator
   * image: string | undefined; // A URL to an image representing the validator
   * apy: number; // The Annual Percentage Yield (APY) offered by this validator
   * delegators: number; // The total number of unique delegators
   * operatorAddress: Address; // The blockchain address of the validator's operator
   * creditAddress: Address; // The blockchain address of the credit contract
   * }
   *
   * export enum ValidatorStatus {
   * Active,
   * Inactive,
   * Jailed,
   * }
   * ```
   */
  getValidators(chain: GuardianChain): Promise<Validator[]> {
    return this.getInternalService(chain).getValidators();
  }

  /**
   * Retrieves the delegations (staked tokens) for a given address on a specific blockchain chain.
   * This is relevant for networks where users can delegate their tokens
   * to validators to earn rewards.
   * @param chain The GuardianChain object representing the blockchain.
   * @param address The blockchain address for which to retrieve delegations. Must be a valid address.
   * @returns A promise that resolves to a `Delegations` object.
   * The `Delegations` object provides a comprehensive summary of a delegator's staking activities,
   * including an array of individual `Delegation` records and a `StakingSummary`
   * of overall protocol parameters and statistics.
   * The structure is as follows:
   * ```typescript
   *  export interface Delegations {
   *  delegations: Delegation[]; // Array of individual delegation details.
   *  stakingSummary: StakingSummary; // Overall staking protocol summary.
   * }
   *
   * export interface Delegation {
   *  id: string; // Unique identifier for this specific delegation.
   *  validator: Validator; // The validator to whom this delegation is made.
   *  amount: bigint; // The amount of coins (as a `bigint`) delegated.
   *  status: DelegationStatus; // The current status of this delegation (e.g., Active, Pending, Claimable).
   *  delegationIndex: number; // An index to identify individual unbond/claim requests.
   *  pendingUntil: number; // Timestamp when a pending unbond/claim becomes available.
   * }
   *
   * export enum DelegationStatus {
   *  Active, // The delegation is active and earning rewards.
   *  Pending, // The delegation is in a pending state (e.g., after an unbond request).
   *  Claimable, // Unbonded tokens are available to be claimed.
   *  Inactive, // The delegation is no longer active.
   * }
   *
   * export interface StakingSummary {
   *  totalProtocolStake: number; // Total tokens staked across the protocol.
   *  maxApy: number; // Maximum APY offered by active validators.
   *  minAmountToStake: bigint; // Minimum amount required for a new stake.
   *  unboundPeriodInMillis: number; // Duration coins are locked after unbond.
   *  redelegateFeeRate: number; // Fee rate for re-delegation.
   *  activeValidators: number; // Current number of active validators.
   *  totalValidators: number; // Total number of registered validators.
   * }
   * ```
   * @throws Error if the provided address is invalid.
   */
  getDelegations(chain: GuardianChain, address: string): Promise<Delegations> {
    const service = this.getInternalService(chain);
    if (!service.isValidAddress(address)) {
      throw new ValidationError(
        ValidationErrorCode.INVALID_ADDRESS,
        `"${address}" is not a valid address for chain "${chain.chainId}".`
      );
    }
    return service.getDelegations(address);
  }

  /**
   * Retrieves the balances for a given address on a specific blockchain chain.
   * * Each Balance object in the array will have the following structure:
   * ```typescript
   * export type Balance =
   * | AvailableBalance
   * | StakedBalance
   * | PendingBalance
   * | ClaimableBalance;
   *
   * interface BalanceBase {
   *  amount: bigint; // The amount of the balance
   *  type: BalanceType; // The type of balance (e.g., "Available", "Staked", "Pending", "Claimable")
   * }
   *
   * export enum BalanceType {
   *  Available = "Available",
   *  Staked = "Staked",
   *  Pending = "Pending",
   *  Claimable = "Claimable",
   * }
   *
   * ```
   * @param chain The GuardianChain object representing the blockchain.
   * @param address The address for which to retrieve balances.
   * @returns A promise that resolves to an array of Balance objects.
   * @throws Error if the provided address is invalid.
   */
  getBalances(chain: GuardianChain, address: string): Promise<Balance[]> {
    const service = this.getInternalService(chain);
    if (!service.isValidAddress(address)) {
      throw new ValidationError(
        ValidationErrorCode.INVALID_ADDRESS,
        `"${address}" is not a valid address for chain "${chain.chainId}".`
      );
    }

    return service.getBalances(address);
  }

  /**
   * Retrieves the nonce for a given address on a specific blockchain chain.
   * @param chain The GuardianChain object representing the blockchain.
   * @param address The address for which to retrieve the nonce.
   * @returns A promise that resolves to the nonce as a number.
   * @throws Error if the provided address is invalid.
   */
  getNonce(chain: GuardianChain, address: string): Promise<number> {
    const service = this.getInternalService(chain);
    if (!service.isValidAddress(address)) {
      throw new ValidationError(
        ValidationErrorCode.INVALID_ADDRESS,
        `"${address}" is not a valid address for chain "${chain.chainId}".`
      );
    }

    return service.getNonce(address);
  }

  /**
   * Estimates the fee for a given transaction.
   * @param transaction The transaction for which to estimate the fee. This can be one of the following types:
   * - `DelegateTransaction`: For staking tokens to a validator.
   * ```typescript
   * interface DelegateTransaction extends BaseTransaction {
   *  type: TransactionType.Delegate;
   *  isMaxAmount: boolean; // Indicates if max available amount is delegated
   *  validator: Validator | OperatorAddress; // The validator to delegate to
   * }
   * ```
   * - `UndelegateTransaction`: For un-staking tokens from a validator.
   * ```typescript
   * interface UndelegateTransaction extends BaseTransaction {
   *  type: TransactionType.Undelegate;
   *  isMaxAmount: boolean; // Indicates if max staked amount is undelegated
   *  validator: Validator | OperatorAddress; // The validator to undelegate from
   * }
   * ```
   * - `RedelegateTransaction`: For moving staked tokens from one validator to another.
   * ```typescript
   * interface RedelegateTransaction extends BaseTransaction {
   *  type: TransactionType.Redelegate;
   *  isMaxAmount: boolean; // Indicates if max amount from fromValidator is redelegated
   *  fromValidator: Validator | OperatorAddress; // The validator to move from
   *  toValidator: Validator | OperatorAddress; // The validator to move to
   * }
   * ```
   * - `ClaimTransaction`: For claiming unbonded or earned tokens.
   * ```typescript
   * interface ClaimTransaction extends BaseTransaction {
   *  type: TransactionType.Claim;
   *  validator: Validator | OperatorAddress; // The validator associated with the claim
   *  index: bigint; // The specific index of the unbond request or claimable item
   * }
   * ```
   * All transaction types extend `BaseTransaction`, which includes:
   * ```typescript
   * interface BaseTransaction {
   *  type: TransactionType; // The specific type of the transaction
   *  chain: GuardianChain; // The blockchain network
   *  amount: bigint; // The amount of tokens involved
   *  account?: Account | Address | undefined; // The initiating account/address
   * }
   * ```
   * @returns A promise that resolves to a Fee object.
   */
  estimateFee(transaction: Transaction): Promise<Fee> {
    validateTransaction(transaction);
    const chain = transaction.chain;

    return this.getInternalService(chain).estimateFee(transaction);
  }

  /**
   * Signs a transaction using the provided signing arguments (private key or account).
   * @param signingArgs The arguments required for signing.
   * @returns A promise that resolves to the signed transaction as a hexadecimal string.
   */
  sign(signingArgs: SigningWithPrivateKey): Promise<string> {
    validateSignArgs(signingArgs);
    const chain = signingArgs.transaction.chain;

    return this.getInternalService(chain).sign(signingArgs);
  }

  /**
   * Performs a pre-hash operation on a transaction. This step is often part of the signing
   * process, where the transaction data is transformed into a fixed-size hash that will
   * then be signed by MPC server or external entity, if you have access to privateKey you are better directly calling
   * sign() method. This might involve:
   * - Serializing the transaction data according to blockchain-specific rules (e.g., RLP encoding for Ethereum).
   * - Hashing the serialized data using a cryptographic hash function (e.g., Keccak-256).
   * The result is the exact message digest that needs to be signed.
   * @param preHasArgs The base arguments for the pre-hash operation, including the transaction details.
   * @returns A promise that resolves to a `PrehashResult`. This result typically contains the
   * hashed transaction data (often as a hexadecimal string or a `Uint8Array`)
   * that is ready to be signed.
   */
  preHash(preHasArgs: BaseSignArgs): Promise<PrehashResult> {
    validateSignArgs(preHasArgs);
    const chain = preHasArgs.transaction.chain;

    return this.getInternalService(chain).prehash(preHasArgs);
  }

  /**
   * Compiles a transaction. This step typically takes the signed transaction data (or components
   * that allow for its reconstruction) and assembles them into a format ready for broadcast
   * to the blockchain network. This function is typically used in conjunction with `preHash`.
   * After `preHash` generates the digest and it's subsequently signed, `compile` then takes the 
   * signature and original transaction data to construct the final, sendable transaction payload. 
   * This might involve:
   * - Combining the raw transaction data, signature (R, S, V values for ECDSA), and potentially
   * other metadata (like `from` address if not included in the signed hash).
   * - Encoding the complete transaction into a hexadecimal string or a byte array
   * that represents the final, executable transaction on the network.
   * This compiled transaction is what you would send to a blockchain node (e.g., via an RPC call)
   * for inclusion in a block.
   * @param compileArgs The arguments required for compilation, which typically include the signed
   * transaction components (e.g., from `sign` or external signing processes).
   * @returns A promise that resolves to a `Hex` string, representing the fully compiled,
   * ready-to-broadcast transaction.
   */
  compile(compileArgs: CompileArgs): Promise<string> {
    validateSignArgs(compileArgs.signArgs);
    const chain = compileArgs.signArgs.transaction.chain;

    return this.getInternalService(chain).compile(compileArgs);
  }

  /**
   * Retrieves or initializes the internal service contract for a given blockchain chain.
   * This method ensures that only one service instance exists per chain ID.
   * @param guardianChain The GuardianChain object representing the blockchain.
   * @returns The GuardianServiceContract instance for the specified chain.
   * @throws Error if the chain ID is undefined, the chain is not supported, or the runtime configuration is missing.
   */
  private getInternalService(
    guardianChain: GuardianChain
  ): GuardianServiceContract {
    const chainId = guardianChain.chainId; // adjust this once supporting more chains
    if (chainId === undefined) {
      throw new ConfigError(
        ConfigErrorCode.MISSING_CHAIN_ID,
        "Cannot get blockchain service: chainId is undefined."
      );
    }

    if (this.initializedServices.has(chainId)) {
      return this.initializedServices.get(chainId)!;
    }

    const chain = getChainById(chainId);
    if (!chain) {
      throw new ConfigError(
        ConfigErrorCode.UNSUPPORTED_CHAIN,
        `Chain with ID "${chainId}" is not supported by the Guardian SDK. Please check 'getSupportedChains()'.`
      );
    }

    const serviceConfig = this.config.chains[chainId];
    if (!serviceConfig) {
      throw new ConfigError(
        ConfigErrorCode.MISSING_CHAIN_CONFIG,
        `Runtime configuration for chain "${chainId}" is missing in the provided SDK config. ` +
          `Please ensure 'sdkConfig.chains.${chainId}' is defined.`
      );
    }

    let guardianService: GuardianServiceContract;

    switch (chain.id) {
      case "bsc-mainnet":
        guardianService = provideGuarService(chain, serviceConfig.rpcUrl);
        break;
      default:
        throw new ConfigError(
          ConfigErrorCode.UNSUPPORTED_CHAIN,
          `No service implementation found for chain type: ${chain.type} (Chain ID: ${chainId}).`
        );
    }

    this.initializedServices.set(chainId, guardianService);
    return guardianService;
  }
}

// ─── Module-level validation helpers ─────────────────────────────────────────

/**
 * Validates the `amount` field of a transaction.
 * Claim transactions carry no value so they are exempt from this check.
 */
function validateTransaction(transaction: Transaction): void {
  if (
    transaction.type !== TransactionType.Claim &&
    transaction.amount <= 0n
  ) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_AMOUNT,
      `Transaction amount must be greater than zero (got ${transaction.amount}).`
    );
  }
}

/**
 * Validates the common fields shared by sign / preHash / compile calls.
 */
function validateSignArgs(args: BaseSignArgs): void {
  validateTransaction(args.transaction);

  if (args.nonce < 0 || !Number.isInteger(args.nonce)) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_NONCE,
      `Nonce must be a non-negative integer (got ${args.nonce}).`
    );
  }

  if (args.fee.gasLimit <= 0n) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_FEE,
      `Fee gasLimit must be greater than zero (got ${args.fee.gasLimit}).`
    );
  }

  if (args.fee.gasPrice <= 0n) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_FEE,
      `Fee gasPrice must be greater than zero (got ${args.fee.gasPrice}).`
    );
  }
}
