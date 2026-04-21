import { describe, it, expect, vi, beforeAll } from "vitest";
import { SignService } from "../../src/cardano-chain/services/sign-service";
import { SigningError, ValidationError } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../../src/chain";
import protocolParamsFixture from "../fixtures/protocol_params.json";
import utxosFixture from "../fixtures/utxos.json";
import type {
  BlockfrostProtocolParams,
  BlockfrostUtxo,
} from "../../src/cardano-chain/rpc/blockfrost-rpc-types";
import { Ed25519PrivateKey, Ed25519PrivateNormalKeyHex } from "@cardano-sdk/crypto";

/**
 * Real mainnet values, verified with @cardano-sdk/core.
 *
 * PAYMENT_ADDRESS: CIP-0019 official test vector (addr1q...)
 * POOL_ID: verified mainnet pool (bech32 checksum confirmed)
 *   cold key hash → 0f292fcaa02b8b2f9b3c8f9fd8e0bb21abedb692a6d5058df3ef2735
 *
 * PAYMENT_KEY / STAKING_KEY: Ed25519 seeds (32-byte hex) — test-only, never use in production.
 */
const PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

// Well-known Hardhat/test Ed25519 seeds — do NOT use on mainnet
const PAYMENT_KEY = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae3d55";
const STAKING_KEY = "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4d0bd6d1";

const PARAMS = protocolParamsFixture as BlockfrostProtocolParams;
const UTXOS = utxosFixture as BlockfrostUtxo[];

const CARDANO_FEE = {
  type: "UtxoFee" as const,
  txSizeBytes: 400,
  total: 200_000n,
};

let STAKING_PUBLIC_KEY: string;

function makeRpcClient() {
  return {
    getProtocolParams: vi.fn().mockResolvedValue(PARAMS),
    getUtxos: vi.fn().mockResolvedValue(UTXOS),
    getLatestBlock: vi.fn().mockResolvedValue({ slot: 100_000_000 }),
    getAccountOrNull: vi.fn().mockResolvedValue(null), // unregistered by default
    submitTx: vi.fn(),
  };
}

// @cardano-sdk/crypto uses libsodium-wrappers-sumo which initialises asynchronously.
beforeAll(async () => {
  const { blake2b } = await import("@cardano-sdk/crypto");
  blake2b.hash(new Uint8Array(4), 28); // confirms sodium is ready

  // Derive staking public key from the test staking private key for prehash tests.
  STAKING_PUBLIC_KEY = Ed25519PrivateKey.fromNormalHex(Ed25519PrivateNormalKeyHex(STAKING_KEY))
    .toPublic()
    .hex();
});

describe("SignService", () => {
  describe("sign — error cases", () => {
    it("throws SigningError when signing args lack payment/staking keys", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.sign({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
            account: PAYMENT_ADDRESS,
          },
          fee: CARDANO_FEE,
          nonce: 0,
        } as any)
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("INVALID_SIGNING_ARGS");
        return true;
      });
    });

    it("throws ValidationError when transaction.account is missing", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.sign({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
          },
          fee: CARDANO_FEE,
          nonce: 0,
          paymentPrivateKey: PAYMENT_KEY,
          stakingPrivateKey: STAKING_KEY,
        } as any)
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).code).toBe("INVALID_ADDRESS");
        return true;
      });
    });

    it("throws SigningError when fee type is not UtxoFee", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.sign({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
            account: PAYMENT_ADDRESS,
          },
          fee: { type: "GasFee", gasPrice: 0n, gasLimit: 0n, total: 0n },
          nonce: 0,
          paymentPrivateKey: PAYMENT_KEY,
          stakingPrivateKey: STAKING_KEY,
        } as any)
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("INVALID_SIGNING_ARGS");
        return true;
      });
    });
  });

  describe("sign — happy path", () => {
    it.each([
      {
        name: "delegate",
        tx: {
          type: "Delegate" as const,
          chain: cardanoMainnet,
          amount: 5_000_000n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
      },
      {
        name: "redelegate",
        tx: {
          type: "Redelegate" as const,
          chain: cardanoMainnet,
          amount: 0n,
          isMaxAmount: false,
          fromValidator: POOL_ID,
          toValidator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
      },
      {
        name: "undelegate",
        tx: {
          type: "Undelegate" as const,
          chain: cardanoMainnet,
          amount: 0n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
      },
      {
        name: "claim",
        tx: {
          type: "ClaimRewards" as const,
          chain: cardanoMainnet,
          amount: 500_000n,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
      },
    ])("$name — returns a valid CBOR hex string", async ({ tx }) => {
      const service = new SignService(makeRpcClient() as any);

      const result = await service.sign({
        transaction: tx as any,
        fee: CARDANO_FEE,
        nonce: 0,
        paymentPrivateKey: PAYMENT_KEY,
        stakingPrivateKey: STAKING_KEY,
      });

      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      expect(result).toMatch(/^[0-9a-f]+$/);
    });

    it("produces deterministic output for identical inputs", async () => {
      const service = new SignService(makeRpcClient() as any);

      const args = {
        transaction: {
          type: "Delegate" as const,
          chain: cardanoMainnet,
          amount: 5_000_000n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
        fee: CARDANO_FEE,
        nonce: 0,
        paymentPrivateKey: PAYMENT_KEY,
        stakingPrivateKey: STAKING_KEY,
      };

      const result1 = await service.sign(args as any);
      const result2 = await service.sign(args as any);

      expect(result1).toBe(result2);
    });
  });

  describe("prehash", () => {
    it("throws ValidationError when transaction.account is missing", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.prehash({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
          },
          fee: CARDANO_FEE,
          nonce: 0,
        } as any)
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it("throws SigningError when fee type is not UtxoFee", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.prehash({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
            account: PAYMENT_ADDRESS,
          },
          fee: { type: "GasFee", gasPrice: 0n, gasLimit: 0n, total: 0n },
          nonce: 0,
        } as any)
      ).rejects.toBeInstanceOf(SigningError);
    });

    it("throws SigningError when stakingPublicKey is missing", async () => {
      const service = new SignService(makeRpcClient() as any);

      await expect(
        service.prehash({
          transaction: {
            type: "Delegate",
            chain: cardanoMainnet,
            amount: 5_000_000n,
            isMaxAmount: false,
            validator: POOL_ID,
            account: PAYMENT_ADDRESS,
          },
          fee: CARDANO_FEE,
          nonce: 0,
          // no stakingPublicKey
        } as any)
      ).rejects.toBeInstanceOf(SigningError);
    });

    it("returns serializedTransaction (tx body hash) and signArgs", async () => {
      const service = new SignService(makeRpcClient() as any);

      const signArgs = {
        transaction: {
          type: "Delegate" as const,
          chain: cardanoMainnet,
          amount: 5_000_000n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
        fee: CARDANO_FEE,
        nonce: 0,
        stakingPublicKey: STAKING_PUBLIC_KEY,
      };

      const result = await service.prehash(signArgs as any);

      // serializedTransaction is the 32-byte (64 hex-char) Blake2b-256 hash of the tx body
      expect(typeof result.serializedTransaction).toBe("string");
      expect(result.serializedTransaction).toMatch(/^[0-9a-f]{64}$/);
      // result.signArgs contains _txBodyCbor in addition to the caller-provided fields
      expect(result.signArgs).toMatchObject(signArgs);
    });
  });

  describe("compile", () => {
    it("throws SigningError when signature does not have 4 colon-delimited parts", async () => {
      const service = new SignService(makeRpcClient() as any);

      const signArgs = {
        transaction: {
          type: "Delegate" as const,
          chain: cardanoMainnet,
          amount: 5_000_000n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
        fee: CARDANO_FEE,
        nonce: 0,
      };

      await expect(
        service.compile({ signArgs: signArgs as any, signature: "onlyonepart" })
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("INVALID_SIGNING_ARGS");
        return true;
      });
    });

    it("throws SigningError when signArgs were not produced by prehash()", async () => {
      const service = new SignService(makeRpcClient() as any);

      // compile() requires _txBodyCbor which is only present in signArgs returned by prehash().
      // Passing manually-constructed signArgs must throw INVALID_SIGNING_ARGS.
      await expect(
        service.compile({
          signArgs: {
            transaction: {
              type: "Delegate" as const,
              chain: cardanoMainnet,
              amount: 5_000_000n,
              isMaxAmount: false,
              validator: POOL_ID,
            },
            fee: CARDANO_FEE,
            nonce: 0,
          } as any,
          signature: `${"aa".repeat(64)}:${"cc".repeat(32)}:${"dd".repeat(64)}:${"cc".repeat(32)}`,
        })
      ).rejects.toSatisfy((err: unknown) => {
        expect(err).toBeInstanceOf(SigningError);
        expect((err as SigningError).code).toBe("INVALID_SIGNING_ARGS");
        return true;
      });
    });

    it("returns a signed CBOR hex string from external signatures", async () => {
      const service = new SignService(makeRpcClient() as any);

      const prehashArgs = {
        transaction: {
          type: "Delegate" as const,
          chain: cardanoMainnet,
          amount: 5_000_000n,
          isMaxAmount: false,
          validator: POOL_ID,
          account: PAYMENT_ADDRESS,
        },
        fee: CARDANO_FEE,
        nonce: 0,
        stakingPublicKey: STAKING_PUBLIC_KEY,
      };

      // compile() requires signArgs produced by prehash() — _txBodyCbor must be present
      const { signArgs } = await service.prehash(prehashArgs as any);

      // format: paymentSigHex:stakingVKeyHex:stakingSigHex:paymentVKeyHex
      // stakingVKey must match the STAKING_PUBLIC_KEY used in prehash() — compile() verifies this
      const paymentSig = "aa".repeat(64); // 64-byte signature
      const stakingVKey = STAKING_PUBLIC_KEY; // must match prehash stakingPublicKey
      const stakingSig = "dd".repeat(64); // 64-byte signature
      const paymentVKey = "ee".repeat(32); // 32-byte public key
      const signature = `${paymentSig}:${stakingVKey}:${stakingSig}:${paymentVKey}`;

      const result = await service.compile({ signArgs, signature });

      expect(typeof result).toBe("string");
      expect(result).toMatch(/^[0-9a-f]+$/);
    });
  });
});
