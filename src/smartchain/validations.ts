import { isAddress } from "viem";
import { BaseSignArgs, ValidationError, ValidationErrorCode } from "../common";

export function checkIsValidAddress(address: string): void {
  if (!isAddress(address)) {
    throw new ValidationError(
      ValidationErrorCode.INVALID_ADDRESS,
      `"${address}" is not a valid address for chain SmartChain. Please provide a valid address.`,
    );
  }
}


export function validateSignArgs(args: BaseSignArgs): void {
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