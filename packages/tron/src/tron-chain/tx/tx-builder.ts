import type { TronWeb } from "tronweb";
import type { OperatorAddress, Transaction, Validator } from "@guardian-sdk/sdk";
import { assertValidator, SigningError, ValidationError } from "@guardian-sdk/sdk";
import {
  SUN_PER_TRX,
  type TronDelegateTransaction,
  type TronUndelegateTransaction,
  type UnsignedTronTx,
} from "./tron-types";
import { assertResource } from "../validations";

const srAddress = (v: Validator | OperatorAddress): string =>
  typeof v === "string" ? v : v.operatorAddress;

/** TronWeb's transactionBuilder methods return concrete `Transaction<...Contract>` shapes;
 * narrow via `unknown` to our opaque `UnsignedTronTx` rather than casting `any`. */
const asUnsignedTx = (v: unknown): UnsignedTronTx => v as UnsignedTronTx;

export async function buildUnsignedTx(
  tronWeb: TronWeb,
  tx: Transaction,
  ownerAddress: string
): Promise<UnsignedTronTx> {
  const tb = tronWeb.transactionBuilder;
  switch (tx.type) {
    case "Delegate": {
      const t = tx as TronDelegateTransaction;
      if (t.isMaxAmount)
        throw new ValidationError(
          "INVALID_AMOUNT",
          "Tron does not support isMaxAmount; pass an exact amount (query getBalances/getDelegations for the max)."
        );
      assertResource(t.resource);
      if (t.amount < SUN_PER_TRX)
        throw new ValidationError("INVALID_AMOUNT", "Freeze amount must be at least 1 TRX.");
      if (t.amount > Number.MAX_SAFE_INTEGER)
        throw new ValidationError(
          "INVALID_AMOUNT",
          "Freeze amount exceeds JavaScript safe integer limit for TronWeb."
        );
      return asUnsignedTx(await tb.freezeBalanceV2(Number(t.amount), t.resource, ownerAddress));
    }
    case "Undelegate": {
      const t = tx as TronUndelegateTransaction;
      if (t.isMaxAmount)
        throw new ValidationError(
          "INVALID_AMOUNT",
          "Tron does not support isMaxAmount; pass an exact amount (query getBalances/getDelegations for the max)."
        );
      assertResource(t.resource);
      if (t.amount <= 0n)
        throw new ValidationError("INVALID_AMOUNT", "Unfreeze amount must be greater than zero.");
      if (t.amount > Number.MAX_SAFE_INTEGER)
        throw new ValidationError(
          "INVALID_AMOUNT",
          "Unfreeze amount exceeds JavaScript safe integer limit for TronWeb."
        );
      return asUnsignedTx(await tb.unfreezeBalanceV2(Number(t.amount), t.resource, ownerAddress));
    }
    case "Vote": {
      assertValidator(tx);
      if (tx.amount % SUN_PER_TRX !== 0n)
        throw new ValidationError("INVALID_AMOUNT", "Vote amount must be a whole number of TRX.");
      const votes = Number(tx.amount / SUN_PER_TRX);
      if (votes <= 0)
        throw new ValidationError("INVALID_AMOUNT", "Vote amount must be greater than zero.");
      return asUnsignedTx(await tb.vote({ [srAddress(tx.validator)]: votes }, ownerAddress));
    }
    case "ClaimDelegate":
      return asUnsignedTx(await tb.withdrawExpireUnfreeze(ownerAddress));
    case "ClaimRewards":
      return asUnsignedTx(await tb.withdrawBlockRewards(ownerAddress));
    default:
      throw new SigningError(
        "UNSUPPORTED_TRANSACTION_TYPE",
        `Tron does not support transaction type "${(tx as Transaction).type}".`
      );
  }
}
