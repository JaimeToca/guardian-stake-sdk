import { describe, it, expect } from "vitest";
import type { Fee, SolanaFee } from "../../src";

describe("SolanaFee", () => {
  it("is a Fee discriminant", () => {
    const fee: SolanaFee = {
      type: "SolanaFee",
      computeUnits: 200_000n,
      computeUnitPrice: 1n,
      total: 5000n,
    };
    const asFee: Fee = fee;
    expect(asFee.type).toBe("SolanaFee");
  });
});
