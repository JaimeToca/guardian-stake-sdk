import { describe, it, expect } from "vitest";
import { validateSignArgs } from "../src/smartchain/validations";
import { ValidationError } from "@guardian-sdk/sdk";

const VALID_GAS_FEE = {
  type: "GasFee" as const,
  gasPrice: 5_000_000_000n,
  gasLimit: 21_000n,
  total: 5_000_000_000n * 21_000n,
};

describe("validateSignArgs", () => {
  it("does not throw for valid args", () => {
    expect(() =>
      validateSignArgs({
        transaction: {} as any,
        fee: VALID_GAS_FEE,
        nonce: 0,
      })
    ).not.toThrow();
  });

  describe("fee.type validation", () => {
    it("throws INVALID_FEE when fee.type is not GasFee", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: { type: "CardanoFee", txSizeBytes: 300, total: 180000n } as any,
          nonce: 0,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_FEE");
        expect((thrown as ValidationError).message).toContain("CardanoFee");
        return true;
      });
    });

    it("throws INVALID_FEE when fee.type is an arbitrary string", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: { type: "SomeFee", gasPrice: 1n, gasLimit: 1n, total: 1n } as any,
          nonce: 0,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_FEE");
        return true;
      });
    });

    it("accepts GasFee type correctly", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: VALID_GAS_FEE,
          nonce: 5,
        })
      ).not.toThrow();
    });
  });

  describe("nonce validation", () => {
    it("throws INVALID_NONCE for a negative nonce", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: VALID_GAS_FEE,
          nonce: -1,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_NONCE");
        return true;
      });
    });

    it("throws INVALID_NONCE for a non-integer nonce", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: VALID_GAS_FEE,
          nonce: 1.5,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_NONCE");
        return true;
      });
    });

    it("accepts nonce of 0", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: VALID_GAS_FEE,
          nonce: 0,
        })
      ).not.toThrow();
    });
  });

  describe("gasLimit validation", () => {
    it("throws INVALID_FEE when gasLimit is 0", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: { ...VALID_GAS_FEE, gasLimit: 0n },
          nonce: 0,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_FEE");
        return true;
      });
    });

    it("throws INVALID_FEE when gasLimit is negative", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: { ...VALID_GAS_FEE, gasLimit: -1n },
          nonce: 0,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_FEE");
        return true;
      });
    });
  });

  describe("gasPrice validation", () => {
    it("throws INVALID_FEE when gasPrice is 0", () => {
      expect(() =>
        validateSignArgs({
          transaction: {} as any,
          fee: { ...VALID_GAS_FEE, gasPrice: 0n },
          nonce: 0,
        })
      ).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_FEE");
        return true;
      });
    });
  });

  it("fee.type check runs before gasLimit check", () => {
    // If fee type is wrong, fee.gasLimit may not even exist — should still throw fee type error
    expect(() =>
      validateSignArgs({
        transaction: {} as any,
        fee: { type: "CardanoFee", txSizeBytes: 300, total: 180000n } as any,
        nonce: 0,
      })
    ).toSatisfy((thrown: unknown) => {
      expect(thrown).toBeInstanceOf(ValidationError);
      expect((thrown as ValidationError).code).toBe("INVALID_FEE");
      expect((thrown as ValidationError).message).toContain("GasFee");
      return true;
    });
  });
});