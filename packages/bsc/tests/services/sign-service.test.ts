import { describe, it, expect, vi } from "vitest";
import { parseEther, getAddress, parseTransaction, keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSignService } from "../../src/smartchain/services/sign-service";
import { SigningError, ValidationError } from "@guardian-sdk/sdk";
import { bscMainnet } from "../../src/chain";
import { STAKING_CONTRACT } from "../../src/smartchain/abi/multicall-stake-abi";
import type { StakingRpcClientContract } from "../../src/smartchain/rpc/staking-rpc-client-contract";

// Hardhat/Anvil account #0 — well-known test key, never use in production
const TEST_PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

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
  const service = createSignService(mockStakingRpcClient);

  describe("sign", () => {
    it.each([
      {
        name: "delegate",
        nonce: 1,
        transaction: {
          type: "Delegate" as const,
          chain: bscMainnet,
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
          chain: bscMainnet,
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
          chain: bscMainnet,
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
          type: "ClaimDelegate" as const,
          chain: bscMainnet,
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
      expect(tx.chainId).toBe(Number(bscMainnet.chainId));
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
            chain: bscMainnet,
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

    it("throws on ClaimDelegate without an index", async () => {
      await expect(
        service.sign({
          transaction: {
            type: "ClaimDelegate" as const,
            chain: bscMainnet,
            amount: 0n,
            validator: VALIDATOR,
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
          chain: bscMainnet,
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
      // signArgs echoes the caller-supplied fields verbatim, plus the threaded internal field.
      expect(result.signArgs).toMatchObject(signArgs);
    });
  });

  describe("compile", () => {
    // Account derived from TEST_PRIVATE_KEY (Hardhat/Anvil account #0).
    const SIGNER_ACCOUNT = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

    const buildTransaction = (overrides: Partial<Record<string, unknown>> = {}) => ({
      type: "Delegate" as const,
      chain: bscMainnet,
      amount: parseEther("1"),
      isMaxAmount: false,
      validator: OPERATOR,
      account: SIGNER_ACCOUNT,
      ...overrides,
    });

    async function prehashAndSignExternally(transaction: unknown, nonce = 1) {
      const preHashArgs = { transaction, fee: mockFee, nonce };
      const prehashResult = await service.prehash(preHashArgs as any);

      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const hash = keccak256(prehashResult.serializedTransaction as `0x${string}`);
      const signature = await account.sign({ hash });

      return { prehashResult, signature };
    }

    it("valid prehash -> compile round-trip is byte-identical to sign()", async () => {
      const transaction = buildTransaction();
      const { prehashResult, signature } = await prehashAndSignExternally(transaction, 1);

      const compiled = await service.compile({
        signArgs: prehashResult.signArgs,
        signature,
      });

      const directlySigned = await service.sign({
        transaction: transaction as any,
        fee: mockFee,
        nonce: 1,
        privateKey: TEST_PRIVATE_KEY,
      });

      expect(compiled).toBe(directlySigned);
    });

    // Once _unsignedTx is threaded from prehash(), compile() reuses it VERBATIM — it never
    // rebuilds calldata from signArgs.transaction. So mutating signArgs.transaction.amount or
    // .validator between prehash and compile has NO EFFECT on the assembled/broadcast tx: the
    // bytes that get signed-and-compiled are exactly the bytes returned by prehash(), not a
    // fresh (possibly divergent) rebuild from the mutated fields. This mirrors Cardano's
    // _txBodyCbor / Tron's _rawTx precedent, where compile() only reads signArgs.transaction
    // for `.account`.
    it("ignores transaction.amount mutated after prehash — compiled tx is unaffected", async () => {
      const transaction = buildTransaction();
      const { prehashResult, signature } = await prehashAndSignExternally(transaction, 1);

      const untamperedCompiled = await service.compile({
        signArgs: prehashResult.signArgs,
        signature,
      });

      const tamperedSignArgs = {
        ...prehashResult.signArgs,
        transaction: { ...prehashResult.signArgs.transaction, amount: parseEther("2") },
      };

      const tamperedCompiled = await service.compile({ signArgs: tamperedSignArgs, signature });

      expect(tamperedCompiled).toBe(untamperedCompiled);
    });

    it("ignores transaction.validator mutated after prehash — compiled tx is unaffected", async () => {
      const transaction = buildTransaction();
      const { prehashResult, signature } = await prehashAndSignExternally(transaction, 1);

      const untamperedCompiled = await service.compile({
        signArgs: prehashResult.signArgs,
        signature,
      });

      const tamperedSignArgs = {
        ...prehashResult.signArgs,
        transaction: { ...prehashResult.signArgs.transaction, validator: FROM_OPERATOR },
      };

      const tamperedCompiled = await service.compile({ signArgs: tamperedSignArgs, signature });

      expect(tamperedCompiled).toBe(untamperedCompiled);
    });

    it("throws SIGNATURE_MISMATCH if transaction.account is mutated after prehash", async () => {
      const transaction = buildTransaction();
      const { prehashResult, signature } = await prehashAndSignExternally(transaction, 1);

      const tamperedSignArgs = {
        ...prehashResult.signArgs,
        transaction: { ...prehashResult.signArgs.transaction, account: FROM_OPERATOR },
      };

      await expect(service.compile({ signArgs: tamperedSignArgs, signature })).rejects.toSatisfy(
        (err: unknown) => {
          expect(err).toBeInstanceOf(SigningError);
          expect((err as SigningError).code).toBe("SIGNATURE_MISMATCH");
          // Must never leak the signature or key material in the error message.
          expect((err as SigningError).message).not.toContain(signature);
          expect((err as SigningError).message).not.toContain(TEST_PRIVATE_KEY);
          return true;
        }
      );
    });

    it("rejects a signature that recovers to a different account, before any RPC call", async () => {
      const transaction = buildTransaction();
      const { prehashResult } = await prehashAndSignExternally(transaction, 1);

      // Sign the SAME digest with an unrelated private key — a valid signature, but for
      // the wrong signer relative to transaction.account.
      const OTHER_PRIVATE_KEY =
        "0x94a3490ff125e8ddf073875661cbbe3ee235a1d9a326dedcd7fec87ad3ccc71c" as const;
      const otherAccount = privateKeyToAccount(OTHER_PRIVATE_KEY);
      const hash = keccak256(prehashResult.serializedTransaction as `0x${string}`);
      const wrongSignature = await otherAccount.sign({ hash });

      const rpcClient = {
        ...mockStakingRpcClient,
        getSharesByPooledBNBData: vi.fn().mockResolvedValue(MOCK_SHARES),
        getShareBalance: vi.fn().mockResolvedValue(MOCK_SHARES),
      };
      const rpcAwareService = createSignService(rpcClient);

      await expect(
        rpcAwareService.compile({ signArgs: prehashResult.signArgs, signature: wrongSignature })
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("SIGNATURE_MISMATCH");
        expect((err as SigningError).message).not.toContain(wrongSignature);
        expect((err as SigningError).message).not.toContain(OTHER_PRIVATE_KEY);
        return true;
      });

      // Undelegate/Redelegate no longer re-run bnbToShares()/live RPC in compile() at all —
      // confirm no RPC call happened on this Delegate case (which never called RPC to begin
      // with) as a baseline, then explicitly cover Undelegate below.
      expect(rpcClient.getSharesByPooledBNBData).not.toHaveBeenCalled();
      expect(rpcClient.getShareBalance).not.toHaveBeenCalled();
    });

    it("does not re-run live RPC (bnbToShares) for Undelegate in compile()", async () => {
      const rpcClient = {
        ...mockStakingRpcClient,
        getSharesByPooledBNBData: vi.fn().mockResolvedValue(MOCK_SHARES),
        getShareBalance: vi.fn().mockResolvedValue(MOCK_SHARES),
      };
      const rpcAwareService = createSignService(rpcClient);

      const transaction = buildTransaction({ type: "Undelegate" as const, validator: VALIDATOR });
      const preHashArgs = { transaction, fee: mockFee, nonce: 1 };
      const prehashResult = await rpcAwareService.prehash(preHashArgs as any);

      // prehash() legitimately calls bnbToShares() once to build the unsigned tx.
      expect(rpcClient.getSharesByPooledBNBData).toHaveBeenCalledTimes(1);

      const account = privateKeyToAccount(TEST_PRIVATE_KEY);
      const hash = keccak256(prehashResult.serializedTransaction as `0x${string}`);
      const signature = await account.sign({ hash });

      await rpcAwareService.compile({ signArgs: prehashResult.signArgs, signature });

      // compile() must reuse the prehash bytes verbatim — no additional RPC call.
      expect(rpcClient.getSharesByPooledBNBData).toHaveBeenCalledTimes(1);
    });

    it("throws if compile() is called without signArgs produced by prehash()", async () => {
      const signArgs = {
        transaction: buildTransaction(),
        fee: mockFee,
        nonce: 1,
      };

      const signature =
        `0x${"1234567890123456789012345678901234567890123456789012345678901234"}${"1234567890123456789012345678901234567890123456789012345678901234"}1b` as `0x${string}`;

      await expect(service.compile({ signArgs, signature })).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("INVALID_SIGNING_ARGS");
        return true;
      });
    });
  });
});
