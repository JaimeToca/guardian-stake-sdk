import type { Address } from "viem";
import { isAddress } from "viem";
import type { BaseSignArgs } from "@guardian-sdk/sdk";
import { ValidationError } from "@guardian-sdk/sdk";

export function checkIsValidAddress(address: string): void {
  parseEvmAddress(address);
}

export function parseEvmAddress(address: string): Address {
  if (!isAddress(address)) {
    throw new ValidationError("INVALID_ADDRESS", `"${address}" is not a valid EVM address.`);
  }
  return address;
}

export function validateSignArgs(args: BaseSignArgs): void {
  if (args.nonce < 0 || !Number.isInteger(args.nonce)) {
    throw new ValidationError(
      "INVALID_NONCE",
      `Nonce must be a non-negative integer (got ${args.nonce}).`
    );
  }

  if (args.fee.gasLimit <= 0n) {
    throw new ValidationError(
      "INVALID_FEE",
      `Fee gasLimit must be greater than zero (got ${args.fee.gasLimit}).`
    );
  }

  if (args.fee.gasPrice <= 0n) {
    throw new ValidationError(
      "INVALID_FEE",
      `Fee gasPrice must be greater than zero (got ${args.fee.gasPrice}).`
    );
  }
}
