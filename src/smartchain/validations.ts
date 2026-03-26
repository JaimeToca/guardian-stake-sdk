import { isAddress } from "viem";
import { ValidationError, ValidationErrorCode } from "../common";

export function checkIsValidAddress(address: string): void {
  if (!isAddress(address)) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_ADDRESS,
      `"${address}" is not a valid address for chain SmartChain. Please provide a valid address.`,
    );
  }
}
