import { Address } from "viem";

/**
 * Represents the detailed information about a validator for staking
 */
export interface Validator {
  /**
   * A unique identifier for the validator, typically their operator address or a derived ID.
   */
  id: string;

  /**
   * The current status of the validator, indicating if they are active, inactive, or jailed.
   */
  status: ValidatorStatus;

  /**
   * The human-readable name of the validator.
   */
  name: string;

  /**
   * A brief description of the validator, often provided by the validator operator.
   */
  description: string;

  /**
   * A URL to an image representing the validator (e.g., logo).
   */
  image: string;

  /**
   * The Annual Percentage Yield (APY) offered by this validator to delegators.
   */
  apy: number;

  /**
   * The total number of unique delegators currently staking with this validator.
   */
  delegators: number;

  /**
   * The blockchain address of the validator's operator.
   */
  operatorAddress: Address;

  /**
   * The blockchain address of the credit contract associated with this validator,
   * used for staking and unstaking operations.
   */
  creditAddress: Address;
}

/**
 * Defines the possible operational statuses of a validator.
 */
export enum ValidatorStatus {
  /**
   * The validator is active and participating in the network's consensus.
   */
  Active,
  /**
   * The validator is currently not active but may become active again.
   */
  Inactive,
  /**
   * The validator has been penalized and and potentially removed from active participation.
   */
  Jailed,
}

/**
 * Represents a comprehensive summary of a delegator's staking activities.
 */
export interface Delegations {
  /**
   * An array of individual delegation records for the delegator.
   */
  delegations: Delegation[];

  /**
   * A summary of overall staking parameters and statistics within the protocol.
   */
  stakingSummary: StakingSummary;
}

/**
 * Represents a single delegation made by a delegator to a specific validator.
 */
export interface Delegation {
  /**
   * A unique identifier for this specific delegation.
   */
  id: string;

  /**
   * The validator to whom this delegation is made.
   */
  validator: Validator;

  /**
   * The amount of coins (as a `bigint`) delegated to the validator.
   */
  amount: bigint;

  /**
   * The current status of this specific delegation (e.g., active, pending unbond, claimable).
   */
  status: DelegationStatus;

  /**
   * An index used to identify individual unbond/claim requests when a delegator has multiple.
   * This one usually comes from the contract or blockchain, which is different to id field
   */
  delegationIndex: number; // used for multiple undelegate/claims

  /**
   * The timestamp (in milliseconds or a similar unit) when a pending unbond or claim will become available.
   */
  pendingUntil: number;
}

/**
 * Defines the various states a delegation can be in.
 */
export enum DelegationStatus {
  /**
   * The delegation is active and earning rewards.
   */
  Active,
  /**
   * The delegation is in a pending state, typically after an unbond request,
   * and is awaiting the unbonding period to complete.
   */
  Pending,
  /**
   * The unbonded tokens are now available to be claimed by the delegator.
   */
  Claimable,
  /**
   * The delegation is no longer active
   */
  Inactive,
}

/**
 * Provides an aggregated overview of the staking protocol's current state and parameters.
 */
export interface StakingSummary {
  /**
   * The total amount of tokens currently staked across the entire protocol.
   */
  totalProtocolStake: number;

  /**
   * The maximum Annual Percentage Yield (APY) currently offered by any active validator.
   */
  maxApy: number;

  /**
   * The minimum amount of coins (as a `bigint`) required to initiate a new stake.
   */
  minAmountToStake: bigint;

  /**
   * The duration (in milliseconds) that coins remain locked after an unbond request
   * before they become claimable.
   */
  unboundPeriodInMillis: number;

  /**
   * The fee rate (as a percentage or ratio) applied to re-delegation operations.
   */
  redelegateFeeRate: number;

  /**
   * The current number of validators actively participating in the network.
   */
  activeValidators: number;

  /**
   * The total number of validators registered within the protocol, including active, inactive and jailed
   * ones.
   */
  totalValidators: number;
}
