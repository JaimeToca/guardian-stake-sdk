import { describe, it, expect } from "vitest";
import { assertValidator, ValidationError } from "../../src";
import type { DelegateTransaction, GuardianChain } from "../../src";

const chain = {} as GuardianChain;

describe("assertValidator", () => {
  it("throws INVALID_VALIDATOR when validator is missing", () => {
    const tx = { type: "Delegate", chain, amount: 1n, isMaxAmount: false } as DelegateTransaction;
    expect(() => assertValidator(tx)).toThrow(ValidationError);
  });

  it("passes through when validator is present", () => {
    const tx = {
      type: "Delegate",
      chain,
      amount: 1n,
      isMaxAmount: false,
      validator: "0xabc",
    } as DelegateTransaction;
    expect(() => assertValidator(tx)).not.toThrow();
  });
});
