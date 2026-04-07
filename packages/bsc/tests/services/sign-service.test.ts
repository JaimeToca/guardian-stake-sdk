import { describe, it, expect, vi } from "vitest";
import { parseEther, getAddress, parseTransaction } from "viem";
import { SignService } from "../../src/smartchain/services/sign-service";
import { ValidationError, PrivateKey } from "@guardian/sdk";
import { BSC_CHAIN } from "../../src/chain";
import { STAKING_CONTRACT } from "../../src/smartchain/abi/multicall-stake-abi";
import type { StakingRpcClientContract } from "../../src/smartchain/rpc/staking-rpc-client-contract";

// Hardhat/Anvil account #0 — well-known test key, never use in production
const TEST_PRIVATE_KEY = PrivateKey.from(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  "secp256k1"
);

// Real BSC mainnet validators fetched from StakeHub (0x0000000000000000000000000000000000002002)
const OPERATOR = getAddress("0x773760b0708a5cc369c346993a0c225d8e4043b1");
const CREDIT_ADDRESS = getAddress("0x4afc633e7b6beb8e552ccddbe06cca3754991e9a");
const FROM_OPERATOR = getAddress("0x343da7ff0446247ca47aa41e2a25c5bbb230ed0a");
const FROM_CREDIT = getAddress("0xec06cb25d9add4bdd67b61432163aff9028aa921");
const TO_OPERATOR = getAddress("0xf2b1d86dc7459887b1f7ce8d840db1d87613ce7f");
const TO_CREDIT = getAddress("0x2804ada1c219e50898e75b2bd052030580f4fbac");

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
  type: "GasFee" as const,
  gasPrice: 5_000_000_000n,
  gasLimit: 21_000n,
  total: 5_000_000_000n * 21_000n,
};

describe("SignService", () => {
  const service = new SignService(mockStakingRpcClient);

  describe("sign", () => {
    it.each([
      {
        name: "delegate",
        nonce: 1,
        transaction: {
          type: "Delegate" as const,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: VALIDATOR,
        },
        expectedHex:
          "0xf8b20185012a05f200825208940000000000000000000000000000000000002002880de0b6b3a7640000b844982ef0a7000000000000000000000000773760b0708a5cc369c346993a0c225d8e4043b100000000000000000000000000000000000000000000000000000000000000008193a073b31800d2b2de7c7881324090fc069a01d0801b8b4e0dcf4bdb88478753b61fa070270d13b7ac554d4fcfe90de6482cbacbea4f695c474ef69c2510be97aef450",
        expectedValue: parseEther("1"),
        expectedAddresses: [OPERATOR],
      },
      {
        name: "undelegate",
        nonce: 2,
        transaction: {
          type: "Undelegate" as const,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: VALIDATOR,
        },
        expectedHex:
          "0xf8aa0285012a05f20082520894000000000000000000000000000000000000200280b8444d99dd16000000000000000000000000773760b0708a5cc369c346993a0c225d8e4043b10000000000000000000000000000000000000000000000000dbd2fc137a300008194a0689fb80ec15d8ee08b82dd07fe4796ba8ab94f4ce26e80c662909ec0469b8fe3a05c6f32f1f5553e07987ded87502bf49c869c989c58d0a5aea0b9bc24fdb67dc2",
        expectedValue: 0n,
        expectedAddresses: [OPERATOR],
      },
      {
        name: "redelegate",
        nonce: 3,
        transaction: {
          type: "Redelegate" as const,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          fromValidator: FROM_VALIDATOR,
          toValidator: TO_VALIDATOR,
        },
        expectedHex:
          "0xf8ea0385012a05f20082520894000000000000000000000000000000000000200280b88459491871000000000000000000000000343da7ff0446247ca47aa41e2a25c5bbb230ed0a000000000000000000000000f2b1d86dc7459887b1f7ce8d840db1d87613ce7f0000000000000000000000000000000000000000000000000dbd2fc137a3000000000000000000000000000000000000000000000000000000000000000000008194a0f7c2352bc160c3b699eb5e4bfd037b0817d53cd0b4017a6ab0b6f2c704cf16e0a042a9454bff941f65f3efe30a6434ad460b2c68b1d1ff2781fc8f5f23a65c00b1",
        expectedValue: 0n,
        expectedAddresses: [FROM_OPERATOR, TO_OPERATOR],
      },
      {
        name: "claim",
        nonce: 4,
        transaction: {
          type: "Claim" as const,
          chain: BSC_CHAIN,
          amount: 0n,
          validator: VALIDATOR,
          index: 3n,
        },
        expectedHex:
          "0xf8aa0485012a05f20082520894000000000000000000000000000000000000200280b844aad3ec96000000000000000000000000773760b0708a5cc369c346993a0c225d8e4043b100000000000000000000000000000000000000000000000000000000000000038193a08bc7f022c9867390b85ef8ff70558a1c6b920c4bf1928d06e66e2b41817fa918a0494c23a4ae173529d0e6cfa794ff636851873faa86ccb83b12c624b2ac77abdd",
        expectedValue: 0n,
        expectedAddresses: [OPERATOR],
      },
    ])("$name", async ({ nonce, transaction, expectedHex, expectedValue, expectedAddresses }) => {
      const rawTx = await service.sign({
        transaction: transaction as any,
        fee: mockFee,
        nonce,
        privateKey: TEST_PRIVATE_KEY,
      });

      expect(rawTx).toBe(expectedHex);
      const tx = parseTransaction(rawTx as `0x${string}`);
      expect(tx.chainId).toBe(Number(BSC_CHAIN.chainId));
      expect(tx.nonce).toBe(nonce);
      expect(tx.gasPrice).toBe(mockFee.gasPrice);
      expect(tx.gas).toBe(mockFee.gasLimit);
      expect(tx.to?.toLowerCase()).toBe(STAKING_CONTRACT.toLowerCase());
      expect(tx.value ?? 0n).toBe(expectedValue);
      expectedAddresses.forEach((addr) =>
        expect(tx.data?.toLowerCase()).toContain(addr.slice(2).toLowerCase())
      );
    });

    it("throws on delegate amount below 1 BNB", async () => {
      await expect(
        service.sign({
          transaction: {
            type: "Delegate" as const,
            chain: BSC_CHAIN,
            amount: parseEther("0.5"),
            isMaxAmount: false,
            validator: OPERATOR,
          },
          fee: mockFee,
          nonce: 1,
          privateKey: TEST_PRIVATE_KEY,
        })
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).code).toBe("INVALID_AMOUNT");
        return true;
      });
    });
  });

  describe("prehash", () => {
    it("returns serialized tx and sign args", async () => {
      const signArgs = {
        transaction: {
          type: "Delegate" as const,
          chain: BSC_CHAIN,
          amount: parseEther("1"),
          isMaxAmount: false,
          validator: OPERATOR,
        },
        fee: mockFee,
        nonce: 5,
      };

      const result = await service.prehash(signArgs);

      expect(result.serializedTransaction).toEqual(
        "0xf8710585012a05f200825208940000000000000000000000000000000000002002880de0b6b3a7640000b844982ef0a7000000000000000000000000773760b0708a5cc369c346993a0c225d8e4043b10000000000000000000000000000000000000000000000000000000000000000388080"
      );
      expect(result.signArgs).toEqual(signArgs);
    });
  });

  describe("compile", () => {
    it("produces a signed tx from a raw signature", async () => {
      const signArgs = {
        transaction: {
          type: "Delegate" as const,
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
