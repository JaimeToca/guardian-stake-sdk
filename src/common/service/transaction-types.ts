import { Chain } from "viem/_types/types/chain";
import { Validator } from "./staking-types";
import { Account, Address } from "viem";
import { GuardianChain } from "../chain";

/**
 * A union type representing all possible staking-related transaction types.
 * This allows for a flexible yet type-safe way to handle different transaction structures.
 */
export type Transaction =
  | DelegateTransaction
  | UndelegateTransaction
  | RedelegateTransaction
  | ClaimTransaction;

/**
 * Represents the on-chain address of a Validator Operator.
 * This address is used for enconding data internally by the signer
 */
export type OperatorAddress = Address;

/**
 * Defines the common properties shared by all transaction types.
 */
interface BaseTransaction {
  /**
   * The specific type of the transaction, as defined by the `TransactionType` enum.
   */
  type: TransactionType;
  /**
   * The blockchain network on which the transaction is intended to occur.
   */
  chain: GuardianChain;
  /**
   * The amount of tokens involved in the transaction, represented as a `bigint`
   * to ensure precision for large values.
   */
  amount: bigint;
  /**
   * The account or address initiating the transaction. It can be an `Account` object,
   * a simple `Address` string, or `undefined` if not immediately available.
   */
  account?: Account | Address | undefined;
}

/**
 * Enumerates the distinct types of staking-related transactions.
 */
export enum TransactionType {
  /**
   * Represents a transaction to stake (delegate) tokens to a validator.
   */
  Delegate = "Delegate",
  /**
   * Represents a transaction to un-stake (undelegate) tokens from a validator.
   */
  Undelegate = "Undelegate",
  /**
   * Represents a transaction to move staked tokens from one validator to another.
   */
  Redelegate = "Redelegate",
  /**
   * Represents a transaction to claim unbonded or earned tokens.
   */
  Claim = "Claim",
}

/**
 * Represents a delegation (staking) transaction.
 * Extends `BaseTransaction` and specifies its type as `TransactionType.Delegate`.
 */
export interface DelegateTransaction extends BaseTransaction {
  type: TransactionType.Delegate;
  /**
   * Indicates whether the maximum available amount is being delegated.
   */
  isMaxAmount: boolean;
  /**
   * The validator to whom the tokens are being delegated.
   */
  validator: Validator | OperatorAddress;
}

/**
 * Represents an undelegation (unstaking) transaction.
 * Extends `BaseTransaction` and specifies its type as `TransactionType.Undelegate`.
 */
export interface UndelegateTransaction extends BaseTransaction {
  type: TransactionType.Undelegate;
  /**
   * Indicates whether the maximum currently staked amount is being undelegated.
   */
  isMaxAmount: boolean;
  /**
   * The validator from whom the tokens are being undelegated.
   */
  validator: Validator | OperatorAddress;
}

/**
 * Represents a re-delegation transaction, moving stake between validators.
 * Extends `BaseTransaction` and specifies its type as `TransactionType.Redelegate`.
 */
export interface RedelegateTransaction extends BaseTransaction {
  type: TransactionType.Redelegate;
  /**
   * Indicates whether the maximum amount from the `fromValidator` is being re-delegated.
   */
  isMaxAmount: boolean;
  /**
   * The validator from which the tokens are being moved.
   */
  fromValidator: Validator | OperatorAddress;
  /**
   * The validator to which the tokens are being moved.
   */
  toValidator: Validator | OperatorAddress;
}

/**
 * Represents a claim transaction, to withdraw unbonded or reward tokens.
 * Extends `BaseTransaction` and specifies its type as `TransactionType.Claim`.
 */
export interface ClaimTransaction extends BaseTransaction {
  type: TransactionType.Claim;
  /**
   * The validator associated with the tokens being claimed (e.g., from an unbonding request).
   */
  validator: Validator | OperatorAddress;
  /**
   * The specific index of the unbond request or claimable item, especially when
   * a delegator has multiple pending claims. Represented as a `bigint`.
   */
  index: bigint;
}
