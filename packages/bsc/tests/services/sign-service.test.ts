import { describe, it, expect } from "vitest";
import { parseEther, getAddress } from "viem";
import { SignService } from "../../src/smartchain/services/sign-service";
import { TransactionType, FeeType } from "@guardian/sdk";
import { BSC_CHAIN } from "../../src/chain";

const OPERATOR = getAddress("0x1234567890123456789012345678901234567890");
const FROM_OPERATOR = getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const TO_OPERATOR = getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

const mockFee = {
  type: FeeType.GasFee,
  gasPrice: 5000000000n,
  gasLimit: 21000n,
  total: 5000000000n * 21000n,
};

describe("SignService", () => {
  const service = new SignService();

  describe("buildCallData", () => {
    it("encodes a Delegate transaction using the validator object", () => {
      const { data, amount } = service.buildCallData({
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: { operatorAddress: OPERATOR } as any,
      });

      expect(data).toMatch(/^0x/);
      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(parseEther("1"));
    });

    it("encodes a Delegate transaction using a raw operator address", () => {
      const { data, amount } = service.buildCallData({
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("2"),
        isMaxAmount: false,
        validator: OPERATOR,
      });

      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(parseEther("2"));
    });

    it("encodes an Undelegate transaction with amount 0", () => {
      const { data, amount } = service.buildCallData({
        type: TransactionType.Undelegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: OPERATOR,
      });

      expect(data).toMatch(/^0x/);
      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(0n);
    });

    it("encodes a Redelegate transaction with both validator addresses", () => {
      const { data, amount } = service.buildCallData({
        type: TransactionType.Redelegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        fromValidator: FROM_OPERATOR,
        toValidator: TO_OPERATOR,
      });

      expect(data.toLowerCase()).toContain(FROM_OPERATOR.slice(2).toLowerCase());
      expect(data.toLowerCase()).toContain(TO_OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(0n);
    });

    it("encodes a Claim transaction with the correct index", () => {
      const { data, amount } = service.buildCallData({
        type: TransactionType.Claim,
        chain: BSC_CHAIN,
        amount: 0n,
        validator: OPERATOR,
        index: 3n,
      });

      expect(data).toMatch(/^0x/);
      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(0n);
    });

    it("produces consistent output for the same inputs", () => {
      const input = {
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: OPERATOR,
      } as const;

      const first = service.buildCallData(input);
      const second = service.buildCallData(input);

      expect(first.data).toBe(second.data);
      expect(first.amount).toBe(second.amount);
    });
  });

  describe("prehash", () => {
    it("returns a serialized transaction and the original sign args", async () => {
      const signArgs = {
        transaction: {
          type: TransactionType.Delegate,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: OPERATOR,
        },
        fee: mockFee,
        nonce: 5,
      };

      const result = await service.prehash(signArgs);

      expect(result.serializedTransaction).toMatch(/^0x/);
      expect(result.signArgs).toEqual(signArgs);
    });
  });

  describe("compile", () => {
    it("produces a valid signed transaction hex from r, s, v components", async () => {
      const signArgs = {
        transaction: {
          type: TransactionType.Delegate,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: OPERATOR,
        },
        fee: mockFee,
        nonce: 1,
      };

      const compiled = await service.compile({
        signArgs,
        r: "0x1234567890123456789012345678901234567890123456789012345678901234",
        s: "0x1234567890123456789012345678901234567890123456789012345678901234",
        v: 27n,
      });

      expect(compiled).toMatch(/^0x/);
    });
  });
});
