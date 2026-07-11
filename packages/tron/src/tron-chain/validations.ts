import { ValidationError } from "@guardian-sdk/sdk";
import type { TronAccount, TronResource, TronWitness } from "./rpc/tron-rpc-types";
import { SUN_PER_TRX } from "./tx/tron-types";

export function availableTronPower(account: TronAccount): bigint {
  const frozen = account.frozen.reduce((s, f) => s + f.amount, 0n);
  const voted = account.votes.reduce((s, v) => s + v.votes * SUN_PER_TRX, 0n);
  const available = frozen - voted;
  return available > 0n ? available : 0n;
}

export function assertFreeze(availableBalance: bigint, amountSun: bigint): void {
  if (amountSun < SUN_PER_TRX)
    throw new ValidationError("INVALID_AMOUNT", "Freeze amount must be at least 1 TRX.");
  if (amountSun > availableBalance)
    throw new ValidationError("INVALID_AMOUNT", "Freeze amount exceeds available balance.");
}

export function assertVote(
  account: TronAccount,
  witnesses: TronWitness[],
  srAddress: string,
  amountSun: bigint
): void {
  if (amountSun <= 0n)
    throw new ValidationError("INVALID_AMOUNT", "Vote amount must be greater than zero.");
  if (amountSun % SUN_PER_TRX !== 0n)
    throw new ValidationError("INVALID_AMOUNT", "Vote amount must be a whole number of TRX.");
  if (!witnesses.some((w) => w.address === srAddress)) {
    throw new ValidationError(
      "UNSUPPORTED_OPERATION",
      `Unknown Super Representative "${srAddress}".`
    );
  }
  if (amountSun > availableTronPower(account)) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      "Vote amount exceeds available Tron Power (freeze more TRX first)."
    );
  }
}

export function assertUnfreeze(
  account: TronAccount,
  resource: TronResource,
  amountSun: bigint
): void {
  const frozen = account.frozen.find((f) => f.resource === resource)?.amount ?? 0n;
  if (amountSun <= 0n)
    throw new ValidationError("INVALID_AMOUNT", "Unfreeze amount must be greater than zero.");
  if (amountSun > frozen)
    throw new ValidationError(
      "INVALID_AMOUNT",
      `Unfreeze amount exceeds frozen ${resource} balance.`
    );
}
