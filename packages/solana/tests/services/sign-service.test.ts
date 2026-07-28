import { describe, it, expect, vi } from "vitest";
import type * as SolanaKit from "@solana/kit";

// Capture the exact Uint8Array seed reference sign() passes into Kit keypair derivation, so the
// M-SOLANA-1 test below can inspect that same live buffer after sign() has resolved. sign() must
// pass the seed by reference (not a copy) for a post-call zeroize to be observable this way.
let capturedSignSeed: Uint8Array | undefined;
vi.mock("@solana/kit", async (importOriginal) => {
  const actual = await importOriginal<typeof SolanaKit>();
  return {
    ...actual,
    createKeyPairFromPrivateKeyBytes: (seed: Uint8Array, ...rest: unknown[]) => {
      capturedSignSeed = seed;
      return (
        actual.createKeyPairFromPrivateKeyBytes as unknown as (
          ...a: unknown[]
        ) => ReturnType<typeof actual.createKeyPairFromPrivateKeyBytes>
      )(seed, ...rest);
    },
  };
});
import { address, createKeyPairFromPrivateKeyBytes, signBytes } from "@solana/kit";
import { getStakeStateAccountEncoder, stakeStateV2 } from "@solana-program/stake";
import type { GuardianChain, SolanaFee, Transaction } from "@guardian-sdk/sdk";
import { SigningError } from "@guardian-sdk/sdk";
import {
  constantTimeBytesEqual,
  createSignService,
  parseEd25519SeedHex,
} from "../../src/solana-chain/services/sign-service";
import type { SolanaRpcClientContract } from "../../src/solana-chain/rpc/solana-rpc-client-contract";
import type {
  SolanaClaimDelegateTransaction,
  SolanaUndelegateTransaction,
  SolanaSignArgs,
} from "../../src/solana-chain/tx/solana-types";
import { STAKE_PROGRAM_ADDRESS } from "../../src/solana-chain/state/constants";
import { deriveStakeAddress } from "../../src/solana-chain/state/seed";
import { solanaMainnet } from "../../src/chain";

const chain = solanaMainnet as GuardianChain;

// Deterministic Ed25519 seed (32 zero bytes except last = 1) — address is stable.
const TEST_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
// Derived offline via createKeyPairSignerFromPrivateKeyBytes
const TEST_ADDRESS = "6ASf5EcmmEHTgDJ4X4ZT5vT6iHVJBXPg5AN5YoTCpGWt";

const VOTE = "CertusDeBmqN8ZawdkxK5kFGMwBXdudvWHYwtNgNhvLu";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const RENT = 2_282_880n;

const fee: SolanaFee = {
  type: "SolanaFee",
  computeUnits: 50_000n,
  computeUnitPrice: 0n,
  total: 5_000n,
};

const feeDelegate: SolanaFee = {
  type: "SolanaFee",
  computeUnits: 200_000n,
  computeUnitPrice: 0n,
  total: 5_000n,
};

function encodeStakeForAuthority(deactivationEpoch: bigint): Uint8Array {
  const staker = address(TEST_ADDRESS);
  const voter = address("Vote111111111111111111111111111111111111111");
  const zero = address("11111111111111111111111111111111");
  const state = stakeStateV2("Stake", [
    {
      rentExemptReserve: RENT,
      authorized: { staker, withdrawer: staker },
      lockup: { unixTimestamp: 0n, epoch: 0n, custodian: zero },
    },
    {
      delegation: {
        voterPubkey: voter,
        stake: 1_000_000_000n,
        activationEpoch: 100n,
        deactivationEpoch,
        reserved: Array(8).fill(0),
      },
      creditsObserved: 42n,
    },
    { bits: 0 },
  ]);
  return new Uint8Array(getStakeStateAccountEncoder().encode({ state }));
}

function mockRpc(overrides: Partial<SolanaRpcClientContract> = {}): SolanaRpcClientContract {
  return {
    getBalance: vi.fn().mockResolvedValue(10_000_000_000n),
    getLatestBlockhash: vi.fn().mockResolvedValue({
      blockhash: BLOCKHASH,
      lastValidBlockHeight: 999_999n,
    }),
    getEpochInfo: vi.fn(),
    getVoteAccounts: vi.fn(),
    getMultipleAccounts: vi.fn().mockResolvedValue([null]),
    getMinimumBalanceForRentExemption: vi.fn().mockResolvedValue(RENT),
    getStakeMinimumDelegation: vi.fn().mockResolvedValue(1n),
    getFeeForMessage: vi.fn().mockResolvedValue(5_000n),
    getProgramAccountsStakeByStaker: vi.fn(),
    sendTransaction: vi.fn().mockResolvedValue("Sig11111111111111111111111111111111111111111"),
    getStakeHistory: vi.fn(),
    getClock: vi.fn().mockResolvedValue({ epoch: 200n, unixTimestamp: 1_700_000_000n }),
    getClockEpoch: vi.fn().mockResolvedValue(200n),
    getInflationRate: vi.fn(),
    getSupply: vi.fn(),
    ...overrides,
  };
}

function delegateTx(): Transaction {
  return {
    type: "Delegate",
    chain,
    amount: 1_000_000_000n,
    isMaxAmount: false,
    account: TEST_ADDRESS,
    validator: VOTE,
  } as Transaction;
}

function undelegateTx(stakeAccount: string): SolanaUndelegateTransaction {
  return {
    type: "Undelegate",
    chain,
    amount: 0n,
    isMaxAmount: false,
    account: TEST_ADDRESS,
    stakeAccount,
  };
}

function claimTx(stakeAccount: string): SolanaClaimDelegateTransaction {
  return {
    type: "ClaimDelegate",
    chain,
    amount: 0n,
    account: TEST_ADDRESS,
    stakeAccount,
  };
}

function expectSdkError(promise: Promise<unknown>, ErrorClass: typeof Error, expectedCode: string) {
  return expect(promise).rejects.toSatisfy((err: unknown) => {
    expect(err).toBeInstanceOf(ErrorClass);
    expect((err as { code?: string }).code).toBe(expectedCode);
    return true;
  });
}

describe("parseEd25519SeedHex", () => {
  it("accepts 64 lowercase hex chars", () => {
    const seed = parseEd25519SeedHex(TEST_PRIVATE_KEY);
    expect(seed).toHaveLength(32);
    expect(seed[31]).toBe(1);
  });

  it("rejects wrong length / uppercase / non-hex", () => {
    expect(() => parseEd25519SeedHex("aa")).toThrow(SigningError);
    expect(() => parseEd25519SeedHex("A".repeat(64))).toThrow(SigningError); // uppercase rejected
    expect(() => parseEd25519SeedHex("g".repeat(64))).toThrow(SigningError);
  });
});

describe("constantTimeBytesEqual", () => {
  it("returns true for byte-identical buffers", () => {
    const a = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    const b = Uint8Array.from([0, 1, 2, 253, 254, 255]);
    expect(constantTimeBytesEqual(a, b)).toBe(true);
  });

  it("returns false when any byte differs, including the last", () => {
    const base = Uint8Array.from([10, 20, 30, 40]);
    expect(constantTimeBytesEqual(base, Uint8Array.from([99, 20, 30, 40]))).toBe(false); // first
    expect(constantTimeBytesEqual(base, Uint8Array.from([10, 20, 30, 41]))).toBe(false); // last
  });

  it("returns false for length mismatch (no crash on prefix match)", () => {
    const a = Uint8Array.from([1, 2, 3]);
    const b = Uint8Array.from([1, 2, 3, 4]);
    expect(constantTimeBytesEqual(a, b)).toBe(false);
    expect(constantTimeBytesEqual(b, a)).toBe(false);
  });

  it("treats two empty buffers as equal", () => {
    expect(constantTimeBytesEqual(new Uint8Array(0), new Uint8Array(0))).toBe(true);
  });
});

describe("sign / prehash / compile parity", () => {
  it.each([
    {
      name: "Delegate",
      setup: () => {
        const rpc = mockRpc({
          getMultipleAccounts: vi.fn().mockResolvedValue([null]),
        });
        return { rpc, tx: delegateTx(), fee: feeDelegate };
      },
    },
    {
      name: "Undelegate",
      setup: async () => {
        const stakeAccount = await deriveStakeAddress(TEST_ADDRESS, "0");
        const rpc = mockRpc({
          getMultipleAccounts: vi.fn().mockResolvedValue([
            {
              address: stakeAccount,
              lamports: 1_000_000_000n + RENT,
              data: encodeStakeForAuthority(18_446_744_073_709_551_615n),
              owner: STAKE_PROGRAM_ADDRESS,
            },
          ]),
        });
        return { rpc, tx: undelegateTx(stakeAccount), fee };
      },
    },
    {
      name: "ClaimDelegate",
      setup: async () => {
        const stakeAccount = await deriveStakeAddress(TEST_ADDRESS, "0");
        const rpc = mockRpc({
          getMultipleAccounts: vi.fn().mockResolvedValue([
            {
              address: stakeAccount,
              lamports: 1_000_000_000n + RENT,
              data: encodeStakeForAuthority(110n),
              owner: STAKE_PROGRAM_ADDRESS,
            },
          ]),
        });
        return { rpc, tx: claimTx(stakeAccount), fee };
      },
    },
  ] as const)(
    "$name: sign() wire equals compile(prehash + local Ed25519 sign of messageBytes)",
    async ({ setup }) => {
      const { rpc, tx, fee: opFee } = await setup();
      // Fresh service per path so both share the same mocked blockhash (deterministic message).
      const svc = createSignService(rpc, { seedScanMax: 0 });

      const signedWire = await svc.sign({
        transaction: tx,
        fee: opFee,
        nonce: 0,
        privateKey: TEST_PRIVATE_KEY,
      });

      const pre = await svc.prehash({
        transaction: tx,
        fee: opFee,
        nonce: 0,
      });

      expect(pre.serializedTransaction.length).toBeGreaterThan(0);
      const signArgs = pre.signArgs as SolanaSignArgs;
      expect(signArgs._messageBytes).toBeInstanceOf(Uint8Array);
      expect(typeof signArgs._wireTransaction).toBe("string");

      // Local Ed25519 over the exact prehash digest (message bytes).
      const messageBytes = Buffer.from(pre.serializedTransaction, "base64");
      expect(Buffer.from(signArgs._messageBytes!).equals(messageBytes)).toBe(true);

      const keypair = await createKeyPairFromPrivateKeyBytes(parseEd25519SeedHex(TEST_PRIVATE_KEY));
      const sig = await signBytes(keypair.privateKey, messageBytes);
      const compiledWire = await svc.compile({
        signArgs: pre.signArgs,
        signature: Buffer.from(sig).toString("base64"),
      });

      expect(compiledWire).toBe(signedWire);
      // Wire form is non-empty base64
      expect(Buffer.from(signedWire, "base64").byteLength).toBeGreaterThan(64);
    }
  );
});

describe("M-SOLANA-1: seed zeroization", () => {
  it("zeroizes the parsed Ed25519 seed buffer after sign() returns", async () => {
    capturedSignSeed = undefined;
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });

    await svc.sign({
      transaction: delegateTx(),
      fee: feeDelegate,
      nonce: 0,
      privateKey: TEST_PRIVATE_KEY,
    });

    expect(capturedSignSeed).toBeInstanceOf(Uint8Array);
    expect(capturedSignSeed).toHaveLength(32);
    expect(Array.from(capturedSignSeed!)).toEqual(Array(32).fill(0));
  });
});

describe("sign validations", () => {
  it("rejects non-SolanaFee with INVALID_FEE_TYPE", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });
    await expectSdkError(
      svc.sign({
        transaction: delegateTx(),
        fee: { type: "GasFee", gasPrice: 1n, gasLimit: 1n, total: 1n },
        nonce: 0,
        privateKey: TEST_PRIVATE_KEY,
      }),
      SigningError,
      "INVALID_FEE_TYPE"
    );
  });

  it("rejects malformed privateKey with INVALID_SIGNING_ARGS", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });
    await expectSdkError(
      svc.sign({
        transaction: delegateTx(),
        fee: feeDelegate,
        nonce: 0,
        privateKey: "not-a-key",
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("rejects transaction.account mismatch with derived address", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });
    const tx = {
      ...delegateTx(),
      account: "So11111111111111111111111111111111111111112",
    } as Transaction;
    await expectSdkError(
      svc.sign({
        transaction: tx,
        fee: feeDelegate,
        nonce: 0,
        privateKey: TEST_PRIVATE_KEY,
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });
});

describe("prehash / compile validations", () => {
  it("prehash requires transaction.account", async () => {
    const rpc = mockRpc();
    const svc = createSignService(rpc);
    const tx = { ...delegateTx(), account: undefined } as Transaction;
    await expectSdkError(
      svc.prehash({ transaction: tx, fee: feeDelegate, nonce: 0 }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("compile requires _wireTransaction from prehash", async () => {
    const rpc = mockRpc();
    const svc = createSignService(rpc);
    await expectSdkError(
      svc.compile({
        signArgs: { transaction: delegateTx(), fee: feeDelegate, nonce: 0 },
        signature: Buffer.alloc(64).toString("base64"),
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("compile rejects wrong-length signature bytes", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });
    const pre = await svc.prehash({
      transaction: delegateTx(),
      fee: feeDelegate,
      nonce: 0,
    });
    await expectSdkError(
      svc.compile({
        signArgs: pre.signArgs,
        signature: Buffer.alloc(32).toString("base64"),
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });
});

describe("compile() SEC-SIGN-1d — message-bytes binding + signature verification", () => {
  it("rejects a _wireTransaction whose message diverges from _messageBytes (tampered post-prehash)", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });

    const pre = await svc.prehash({
      transaction: delegateTx(),
      fee: feeDelegate,
      nonce: 0,
    });
    const signArgs = pre.signArgs as SolanaSignArgs;

    // Build a second, different unsigned tx (different compute-unit price -> different message
    // bytes, same transaction type so no additional RPC-side account lookups are needed) and
    // swap it in as _wireTransaction while _messageBytes still reflects the original prehash.
    const pre2 = await svc.prehash({
      transaction: delegateTx(),
      fee: { ...feeDelegate, computeUnitPrice: 12_345n },
      nonce: 0,
    });
    const swappedSignArgs: SolanaSignArgs = {
      ...signArgs,
      _wireTransaction: (pre2.signArgs as SolanaSignArgs)._wireTransaction,
    };

    const keypair = await createKeyPairFromPrivateKeyBytes(parseEd25519SeedHex(TEST_PRIVATE_KEY));
    const messageBytes = Buffer.from(pre.serializedTransaction, "base64");
    const sig = await signBytes(keypair.privateKey, messageBytes);

    await expectSdkError(
      svc.compile({
        signArgs: swappedSignArgs,
        signature: Buffer.from(sig).toString("base64"),
      }),
      SigningError,
      "SIGNATURE_MISMATCH"
    );
  });

  it("rejects a garbage 64-byte signature that doesn't verify against the fee payer", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });

    const pre = await svc.prehash({
      transaction: delegateTx(),
      fee: feeDelegate,
      nonce: 0,
    });

    const garbageSig = Buffer.alloc(64, 7); // well-formed length, not a valid Ed25519 signature
    await expectSdkError(
      svc.compile({
        signArgs: pre.signArgs,
        signature: garbageSig.toString("base64"),
      }),
      SigningError,
      "SIGNATURE_MISMATCH"
    );
  });

  it("rejects a valid signature produced by a different key over the same message", async () => {
    const rpc = mockRpc({ getMultipleAccounts: vi.fn().mockResolvedValue([null]) });
    const svc = createSignService(rpc, { seedScanMax: 0 });

    const pre = await svc.prehash({
      transaction: delegateTx(),
      fee: feeDelegate,
      nonce: 0,
    });
    const messageBytes = Buffer.from(pre.serializedTransaction, "base64");

    // A different, unrelated key signs the exact same message bytes.
    const OTHER_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000002";
    const otherKeypair = await createKeyPairFromPrivateKeyBytes(
      parseEd25519SeedHex(OTHER_PRIVATE_KEY)
    );
    const wrongSig = await signBytes(otherKeypair.privateKey, messageBytes);

    await expectSdkError(
      svc.compile({
        signArgs: pre.signArgs,
        signature: Buffer.from(wrongSig).toString("base64"),
      }),
      SigningError,
      "SIGNATURE_MISMATCH"
    );
  });
});
