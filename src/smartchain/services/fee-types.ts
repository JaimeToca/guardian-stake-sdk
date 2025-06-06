/**
 * Defines the type of fee calculation being used.
 * Currently, only 'GasFee' is supported, but this enum
 * allows for easy expansion to other types like EIP-1559, UserOP etc.. fees in the future.
 */
export enum FeeType {
  GasFee,
}

/**
 * Represents the details of a gas fee.
 * All amounts are expected to be in `bigint` to handle large numbers accurately
 */
export interface GasFee {
  type: FeeType.GasFee;
  gasPrice: bigint;
  gasLimit: bigint;
  total: bigint;
}

/**
 * A union type representing all possible fee structures.
 * This allows for flexible handling of different fee types as the system evolves.
 * Currently, it only includes `GasFee`, but can be extended with `Eip1559Fee` or others, as 
 * previously mentioned.
 */
export type Fee = GasFee;