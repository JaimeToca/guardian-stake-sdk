import { describe, it, expect, vi } from "vitest";
import { parseEther, getAddress } from "viem";
import { SignService } from "../../src/smartchain/services/sign-service";
import { TransactionType, FeeType, ValidationError, ValidationErrorCode } from "@guardian/sdk";
import { BSC_CHAIN } from "../../src/chain";
import type { StakingRpcClientContract } from "../../src/smartchain/rpc/staking-rpc-client-contract";

const OPERATOR = getAddress("0x1234567890123456789012345678901234567890");
const CREDIT_ADDRESS = getAddress("0xcccccccccccccccccccccccccccccccccccccccc");
const FROM_OPERATOR = getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const FROM_CREDIT = getAddress("0xdddddddddddddddddddddddddddddddddddddddd");
const TO_OPERATOR = getAddress("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
const TO_CREDIT = getAddress("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee");

const VALIDATOR = { operatorAddress: OPERATOR, creditAddress: CREDIT_ADDRESS } as any;
const FROM_VALIDATOR = { operatorAddress: FROM_OPERATOR, creditAddress: FROM_CREDIT } as any;
const TO_VALIDATOR = { operatorAddress: TO_OPERATOR, creditAddress: TO_CREDIT } as any;

const MOCK_SHARES = parseEther("0.99");

const mockStakingRpcClient: StakingRpcClientContract = {
  getCreditContractValidators: vi.fn(),
  getPendingUnbondDelegation: vi.fn(),
  getPooledBNBData: vi.fn(),
  getUnbondRequestData: vi.fn(),
  getSharesByPooledBNBData: vi.fn().mockResolvedValue(MOCK_SHARES),
  getShareBalance: vi.fn().mockResolvedValue(MOCK_SHARES),
};

const mockFee = {
  type: FeeType.GasFee,
  gasPrice: 5000000000n,
  gasLimit: 21000n,
  total: 5000000000n * 21000n,
};

describe("SignService", () => {
  const service = new SignService(mockStakingRpcClient);

  describe("buildCallData", () => {
    it("encodes a Delegate transaction using the validator object", async () => {
      const { data, amount } = await service.buildCallData({
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: VALIDATOR,
      });

      expect(data).toMatch(/^0x/);
      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(parseEther("1"));
    });

    it("encodes a Delegate transaction using a raw operator address", async () => {
      const { data, amount } = await service.buildCallData({
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("2"),
        isMaxAmount: false,
        validator: OPERATOR,
      });

      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(parseEther("2"));
    });

    it("encodes an Undelegate transaction — converts BNB to shares", async () => {
      const { data, amount } = await service.buildCallData({
        type: TransactionType.Undelegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: VALIDATOR,
      });

      expect(data).toMatch(/^0x/);
      expect(data.toLowerCase()).toContain(OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(0n);
    });

    it("encodes a Redelegate transaction with both validator addresses", async () => {
      const { data, amount } = await service.buildCallData({
        type: TransactionType.Redelegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        fromValidator: FROM_VALIDATOR,
        toValidator: TO_VALIDATOR,
      });

      expect(data.toLowerCase()).toContain(FROM_OPERATOR.slice(2).toLowerCase());
      expect(data.toLowerCase()).toContain(TO_OPERATOR.slice(2).toLowerCase());
      expect(amount).toBe(0n);
    });

    it("encodes a Claim transaction with the correct index", async () => {
      const { data, amount } = await service.buildCallData({
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

    describe("minimum amount validation", () => {
      it("throws ValidationError for Delegate with amount below 1 BNB", async () => {
        await expect(
          service.buildCallData({
            type: TransactionType.Delegate,
            chain: BSC_CHAIN,
            amount: parseEther("0.5"),
            isMaxAmount: false,
            validator: OPERATOR,
          })
        ).rejects.toSatisfy((err: unknown) => {
          expect(err).toBeInstanceOf(ValidationError);
          expect((err as ValidationError).code).toBe(ValidationErrorCode.INVALID_AMOUNT);
          return true;
        });
      });

      it("allows exactly 1 BNB for Delegate", async () => {
        await expect(
          service.buildCallData({
            type: TransactionType.Delegate,
            chain: BSC_CHAIN,
            amount: parseEther("1"),
            isMaxAmount: false,
            validator: OPERATOR,
          })
        ).resolves.toBeDefined();
      });

      it.each([
        { type: TransactionType.Undelegate, extra: { isMaxAmount: false, validator: VALIDATOR } },
        { type: TransactionType.Redelegate, extra: { isMaxAmount: false, fromValidator: FROM_VALIDATOR, toValidator: TO_VALIDATOR } },
      ])("does not enforce minimum for $type", async ({ type, extra }) => {
        await expect(
          service.buildCallData({ type, chain: BSC_CHAIN, amount: parseEther("0.5"), ...extra } as any)
        ).resolves.toBeDefined();
      });
    });

    it("produces consistent output for the same inputs", async () => {
      const input = {
        type: TransactionType.Delegate,
        chain: BSC_CHAIN,
        amount: parseEther("1"),
        isMaxAmount: false,
        validator: OPERATOR,
      } as const;

      const [first, second] = await Promise.all([
        service.buildCallData(input),
        service.buildCallData(input),
      ]);

      expect(first.data).toBe(second.data);
      expect(first.amount).toBe(second.amount);
    });
  });

  describe("prehash", () => {
    it("returns a serialized transaction and the original sign args", async () => {
      const signArgs = {
        transaction: {
          type: TransactionType.Delegate as const,
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
    it("produces a valid signed transaction hex from a raw signature", async () => {
      const signArgs = {
        transaction: {
          type: TransactionType.Delegate as const,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: OPERATOR,
        },
        fee: mockFee,
        nonce: 1,
      };

      // 65-byte secp256k1 signature: r (32 bytes) + s (32 bytes) + v (1 byte = 0x1b for 27)
      const signature =
        `0x${"1234567890123456789012345678901234567890123456789012345678901234"}${"1234567890123456789012345678901234567890123456789012345678901234"}1b` as `0x${string}`;

      const compiled = await service.compile({ signArgs, signature });

      expect(compiled).toMatch(/^0x/);
    });
  });
});
