import { ValidationError } from "./errors";
import type { Transaction, OperatorAddress } from "./transaction-types";
import type { Validator } from "./staking-types";

/** Runtime guard: BSC/Cardano require a validator even though the field is optional at the type level. */
export function assertValidator(
  tx: Transaction
): asserts tx is Transaction & { validator: Validator | OperatorAddress } {
  if (!("validator" in tx) || tx.validator === undefined) {
    throw new ValidationError(
      "INVALID_VALIDATOR",
      `Transaction type "${tx.type}" requires a validator.`
    );
  }
}
