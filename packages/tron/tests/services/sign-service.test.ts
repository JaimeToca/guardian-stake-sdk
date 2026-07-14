import { describe, it, expect, vi } from "vitest";
import { createSignService } from "../../src/tron-chain/services/sign-service";
import { createTronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";
import type { TronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";
import { SigningError, ValidationError } from "@guardian-sdk/sdk";
import * as Sdk from "@guardian-sdk/sdk";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

/** Shared helper to reduce boilerplate (matches style used in BSC and Cardano tests). */
function expectSdkError(promise: Promise<unknown>, ErrorClass: typeof Error, expectedCode: string) {
  return expect(promise).rejects.toSatisfy((err: unknown) => {
    expect(err).toBeInstanceOf(ErrorClass);
    expect((err as { code?: string }).code).toBe(expectedCode);
    return true;
  });
}

const chain = { id: "tron-mainnet" } as GuardianChain;
const FULL_HOST = "https://node.example";

// Throwaway secp256k1 key (private key = 1); its Tron address is deterministic and public.
const TEST_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

// Invalid keys for validator coverage (same as BSC)
const ZERO_KEY = "0000000000000000000000000000000000000000000000000000000000000000";
const OVERSIZE_KEY = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"; // exceeds secp256k1 order
const NON_HEX_KEY = "00000000000000000000000000000000000000000000000000000000000000gg"; // 64 chars but invalid hex

// A REAL, internally-consistent unsigned FreezeBalanceV2 transaction (its txID/raw_data_hex are the
// genuine sha256/protobuf of raw_data — it passes TronWeb's txCheck). Building a tx normally hits the
// FullNode for the ref block, so we generate this offline once and feed it to the real signer.
const UNSIGNED_FIXTURE = {
  visible: false,
  raw_data: {
    contract: [
      {
        parameter: {
          value: {
            resource: "BANDWIDTH",
            frozen_balance: 1000000,
            owner_address: "417e5f4552091a69125d5dfcb7b8c2659029395bdf", // hex of TEST_ADDRESS
          },
          type_url: "type.googleapis.com/protocol.FreezeBalanceV2Contract",
        },
        type: "FreezeBalanceV2Contract",
      },
    ],
    ref_block_bytes: "0a1b",
    ref_block_hash: "1122334455667788",
    expiration: 1893456060000,
    timestamp: 1893456000000,
  },
  txID: "789c4e184f355f00f44419eded4c5e0de59bdfa517f839c9e5874d4d7523b864",
  raw_data_hex:
    "0a020a1b2208112233445566778840e0bc9ad68d375a57083612530a34747970652e676f6f676c65617069732e636f6d2f70726f746f636f6c2e467265657a6542616c616e63655632436f6e7472616374121b0a15417e5f4552091a69125d5dfcb7b8c2659029395bdf10c0843d7080e896d68d37",
};

// The real secp256k1 signature TronWeb produces for TEST_PRIVATE_KEY over UNSIGNED_FIXTURE.txID.
// Deterministic (RFC-6979) — 65 bytes as 130 hex chars (r‖s‖v).
const REAL_SIGNATURE =
  "5de49a155795320bcf9580803148f9e951dfe558c0e6931a39f1895f8b8862591de5ff1d2105a4219b035f0500f19fdf28eb111d6aee6b602e3daf78b0e9ea721B";

const fee = { type: "ResourceFee", bandwidth: 0n, energy: 0n, total: 0n } as const;

const delegateTx = {
  type: "Delegate",
  chain,
  amount: 1_000_000n,
  isMaxAmount: false,
  resource: "BANDWIDTH",
  account: TEST_ADDRESS,
} as unknown as Transaction;

const undelegateTx = {
  type: "Undelegate",
  chain,
  amount: 1_000_000n,
  isMaxAmount: false,
  resource: "BANDWIDTH",
  account: TEST_ADDRESS,
} as unknown as Transaction;

const voteTx = {
  type: "Vote",
  chain,
  amount: 1_000_000n,
  validator: { operatorAddress: "TPL66VK2gCXNCD7EJg9pgJRfqcRazjhUZY" } as any,
  account: TEST_ADDRESS,
} as unknown as Transaction;

const claimDelegateTx = {
  type: "ClaimDelegate",
  chain,
  amount: 0n,
  account: TEST_ADDRESS,
} as unknown as Transaction;

const claimRewardsTx = {
  type: "ClaimRewards",
  chain,
  amount: 0n,
  account: TEST_ADDRESS,
} as unknown as Transaction;

/**
 * Real TronWeb clients (genuine key derivation + secp256k1 signing).
 * All builder methods are stubbed to return a valid offline fixture so `trx.sign` can run for real.
 * This lets us test the privateKey normalization path across all transaction types without network calls.
 */
function realSetup() {
  const base = createTronWebFactory(FULL_HOST);
  const fixture = () => structuredClone(UNSIGNED_FIXTURE);
  const freezeBalanceV2 = vi.fn(fixture);
  const unfreezeBalanceV2 = vi.fn(fixture);
  const vote = vi.fn(fixture);
  const withdrawExpireUnfreeze = vi.fn(fixture);
  const withdrawBlockRewards = vi.fn(fixture);

  const factory: TronWebFactory = {
    create(privateKey?: string) {
      const tw = base.create(privateKey);
      const tb = tw.transactionBuilder as any;
      tb.freezeBalanceV2 = freezeBalanceV2;
      tb.unfreezeBalanceV2 = unfreezeBalanceV2;
      tb.vote = vote;
      tb.withdrawExpireUnfreeze = withdrawExpireUnfreeze;
      tb.withdrawBlockRewards = withdrawBlockRewards;
      return tw;
    },
  };
  return {
    factory,
    freezeBalanceV2,
    unfreezeBalanceV2,
    vote,
    withdrawExpireUnfreeze,
    withdrawBlockRewards,
  };
}

describe("sign", () => {
  it("really signs the built tx: returns the exact secp256k1 signature over the real txID", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);

    const raw = await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: TEST_PRIVATE_KEY,
    } as never);

    const parsed = JSON.parse(raw);
    expect(parsed.txID).toBe(UNSIGNED_FIXTURE.txID);
    expect(parsed.signature).toEqual([REAL_SIGNATURE]);
    expect(parsed.signature[0]).toHaveLength(130); // 65-byte secp256k1 signature
  });

  it("throws SigningError when privateKey is missing or empty", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: "" } as never),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("throws ValidationError for malformed private key (same validator as BSC)", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    // Short key fails the shared privateKey() validator (64 hex chars + curve checks)
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: "aa" } as never),
      ValidationError,
      "INVALID_PRIVATE_KEY"
    );
  });

  it("rejects zero private key via the shared validator", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: ZERO_KEY } as never),
      ValidationError,
      "INVALID_PRIVATE_KEY"
    );
  });

  it("rejects private key that exceeds secp256k1 curve order", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: OVERSIZE_KEY } as never),
      ValidationError,
      "INVALID_PRIVATE_KEY"
    );
  });

  it("rejects non-hex private key (even at correct length)", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: NON_HEX_KEY } as never),
      ValidationError,
      "INVALID_PRIVATE_KEY"
    );
  });

  it("rejects 0x-prefixed invalid key (validation runs before TronWeb)", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: "0x" + ZERO_KEY } as never),
      ValidationError,
      "INVALID_PRIVATE_KEY"
    );
  });

  it("throws SigningError on sign with unsupported transaction type", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const badTx = { ...delegateTx, type: "FooBar" } as any;
    await expectSdkError(
      svc.sign({ transaction: badTx, fee, nonce: 0, privateKey: TEST_PRIVATE_KEY } as never),
      SigningError,
      "UNSUPPORTED_TRANSACTION_TYPE"
    );
  });

  it("calls the shared privateKey validator (spy)", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const spy = vi.spyOn(Sdk, "privateKey");

    await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: "0x" + TEST_PRIVATE_KEY,
    } as never);

    expect(spy).toHaveBeenCalledWith("0x" + TEST_PRIVATE_KEY);
    spy.mockRestore();
  });

  it("builds with the owner derived from the private key, not transaction.account", async () => {
    const { factory, freezeBalanceV2 } = realSetup();
    const svc = createSignService(factory);
    const txWithDifferentAccount = {
      ...delegateTx,
      account: "TSomeOtherAccount",
    } as unknown as Transaction;

    await svc.sign({
      transaction: txWithDifferentAccount,
      fee,
      nonce: 0,
      privateKey: TEST_PRIVATE_KEY,
    } as never);

    // Owner is the address derived from TEST_PRIVATE_KEY — the wrong `account` on the tx is ignored.
    expect(freezeBalanceV2).toHaveBeenCalledWith(1_000_000, "BANDWIDTH", TEST_ADDRESS);
  });

  it("derives owner correctly from 0x-prefixed private key", async () => {
    const { factory, freezeBalanceV2 } = realSetup();
    const svc = createSignService(factory);
    const txWithDifferentAccount = {
      ...delegateTx,
      account: "TSomeOtherAccount",
    } as unknown as Transaction;
    const keyWithPrefix = "0x" + TEST_PRIVATE_KEY;

    await svc.sign({
      transaction: txWithDifferentAccount,
      fee,
      nonce: 0,
      privateKey: keyWithPrefix,
    } as never);

    expect(freezeBalanceV2).toHaveBeenCalledWith(1_000_000, "BANDWIDTH", TEST_ADDRESS);
  });

  it("accepts private key with 0x prefix (same format as BSC)", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const keyWithPrefix = "0x" + TEST_PRIVATE_KEY;

    const raw = await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: keyWithPrefix,
    } as never);

    const parsed = JSON.parse(raw);
    expect(parsed.txID).toBe(UNSIGNED_FIXTURE.txID);
    expect(parsed.signature).toEqual([REAL_SIGNATURE]);
  });

  it("accepts private key with 0X uppercase prefix", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const keyWithUpperPrefix = "0X" + TEST_PRIVATE_KEY;

    const raw = await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: keyWithUpperPrefix,
    } as never);

    const parsed = JSON.parse(raw);
    expect(parsed.signature[0]).toHaveLength(130);
  });

  it("accepts uppercase hex characters without 0x prefix", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const upperKey = TEST_PRIVATE_KEY.toUpperCase();

    const raw = await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: upperKey,
    } as never);

    const parsed = JSON.parse(raw);
    expect(parsed.signature).toEqual([REAL_SIGNATURE]);
  });

  describe("private key normalization works for all transaction types (0x prefix)", () => {
    const keyWithPrefix = "0x" + TEST_PRIVATE_KEY;

    it.each([
      { name: "Delegate", tx: delegateTx },
      { name: "Undelegate", tx: undelegateTx },
      { name: "Vote", tx: voteTx },
      { name: "ClaimDelegate", tx: claimDelegateTx },
      { name: "ClaimRewards", tx: claimRewardsTx },
    ])("$name", async ({ tx }) => {
      const { factory } = realSetup();
      const svc = createSignService(factory);

      const raw = await svc.sign({
        transaction: tx,
        fee,
        nonce: 0,
        privateKey: keyWithPrefix,
      } as never);

      const parsed = JSON.parse(raw);
      expect(parsed.txID).toBe(UNSIGNED_FIXTURE.txID);
      expect(parsed.signature[0]).toHaveLength(130);
    });
  });

  it("normalizes mixed-case hex + 0x prefix and passes stripped key to TronWeb", async () => {
    const base = createTronWebFactory(FULL_HOST);
    const freezeBalanceV2 = vi.fn(async () => structuredClone(UNSIGNED_FIXTURE));
    const createSpy = vi.spyOn(base, "create");
    const factory: TronWebFactory = {
      create(privateKey?: string) {
        const tw = base.create(privateKey);
        (tw.transactionBuilder as unknown as { freezeBalanceV2: unknown }).freezeBalanceV2 =
          freezeBalanceV2;
        return tw;
      },
    };
    const svc = createSignService(factory);

    // Mixed case hex with 0x prefix (validator lowercases, factory strips)
    const mixedUpperKey = "0X" + TEST_PRIVATE_KEY.toUpperCase();

    await svc.sign({
      transaction: delegateTx,
      fee,
      nonce: 0,
      privateKey: mixedUpperKey,
    } as never);

    // Ensure the key passed to factory had the 0x stripped (no leading 0x)
    expect(createSpy).toHaveBeenCalled();
    const passedKey = createSpy.mock.calls[0][0] as string;
    expect(passedKey).not.toMatch(/^0x/i);
    expect(passedKey).toHaveLength(64);
    expect(passedKey.toLowerCase()).toBe(TEST_PRIVATE_KEY);
  });
});

describe("prehash", () => {
  it("throws when transaction.account is missing", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const txWithoutAccount = { ...delegateTx, account: undefined } as unknown as Transaction;
    await expectSdkError(
      svc.prehash({ transaction: txWithoutAccount, fee, nonce: 0 } as never),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("returns serializedTransaction === real txID and threads the raw tx into signArgs._rawTx", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);

    const result = await svc.prehash({ transaction: delegateTx, fee, nonce: 0 } as never);

    expect(result.serializedTransaction).toBe(UNSIGNED_FIXTURE.txID);
    expect((result.signArgs as { _rawTx: { txID: string } })._rawTx.txID).toBe(
      UNSIGNED_FIXTURE.txID
    );
  });

  it("throws SigningError on prehash with invalid transaction type", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const badTx = { ...delegateTx, type: "UnknownType" } as any;
    await expectSdkError(
      svc.prehash({ transaction: badTx, fee, nonce: 0 } as never),
      SigningError,
      "UNSUPPORTED_TRANSACTION_TYPE"
    );
  });
});

describe("compile", () => {
  it("throws when _rawTx is missing", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.compile({
        signArgs: { transaction: delegateTx, fee, nonce: 0 } as never,
        signature: "sig",
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("throws on empty signature", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.compile({
        signArgs: { transaction: delegateTx, fee, nonce: 0, _rawTx: UNSIGNED_FIXTURE } as never,
        signature: "",
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });

  it("round-trips prehash's signArgs: attaches the external signature to the real raw tx", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);

    const prehashResult = await svc.prehash({ transaction: delegateTx, fee, nonce: 0 } as never);
    const raw = await svc.compile({
      signArgs: prehashResult.signArgs,
      signature: REAL_SIGNATURE,
    });

    const parsed = JSON.parse(raw);
    expect(parsed.signature).toEqual([REAL_SIGNATURE]);
    expect(parsed.txID).toBe(UNSIGNED_FIXTURE.txID);
    expect(parsed.raw_data_hex).toBe(UNSIGNED_FIXTURE.raw_data_hex);
  });

  it("throws SigningError on compile with non-string signature", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expectSdkError(
      svc.compile({
        signArgs: { transaction: delegateTx, fee, nonce: 0, _rawTx: UNSIGNED_FIXTURE } as never,
        signature: 123 as any,
      }),
      SigningError,
      "INVALID_SIGNING_ARGS"
    );
  });
});
