import { describe, it, expect, vi } from "vitest";
import { createSignService } from "../../src/tron-chain/services/sign-service";
import { createTronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";
import type { TronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";
import { SigningError } from "@guardian-sdk/sdk";
import type { GuardianChain, Transaction } from "@guardian-sdk/sdk";

const chain = { id: "tron-mainnet" } as GuardianChain;
const FULL_HOST = "https://node.example";

// Throwaway secp256k1 key (private key = 1); its Tron address is deterministic and public.
const TEST_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

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

/**
 * Real TronWeb clients (genuine key derivation + secp256k1 signing), with only the network-bound
 * `transactionBuilder.freezeBalanceV2` stubbed to return the offline fixture. `trx.sign` runs for real.
 */
function realSetup() {
  const base = createTronWebFactory(FULL_HOST);
  const freezeBalanceV2 = vi.fn(async () => structuredClone(UNSIGNED_FIXTURE));
  const factory: TronWebFactory = {
    create(privateKey?: string) {
      const tw = base.create(privateKey);
      (tw.transactionBuilder as unknown as { freezeBalanceV2: unknown }).freezeBalanceV2 =
        freezeBalanceV2;
      return tw;
    },
  };
  return { factory, freezeBalanceV2 };
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

  it("throws SigningError when privateKey is missing", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expect(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: "" } as never)
    ).rejects.toThrow(SigningError);
  });

  it("throws SigningError when the client can't derive an owner address", async () => {
    // Defensive guard: a client with a key but no defaultAddress should never sign.
    const svc = createSignService({
      create: () =>
        ({
          defaultAddress: { base58: "" },
          transactionBuilder: { freezeBalanceV2: vi.fn() },
          trx: { sign: vi.fn() },
        }) as never,
    });
    await expect(
      svc.sign({ transaction: delegateTx, fee, nonce: 0, privateKey: "aa" } as never)
    ).rejects.toThrow(SigningError);
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
});

describe("prehash", () => {
  it("throws when transaction.account is missing", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    const txWithoutAccount = { ...delegateTx, account: undefined } as unknown as Transaction;
    await expect(
      svc.prehash({ transaction: txWithoutAccount, fee, nonce: 0 } as never)
    ).rejects.toThrow(SigningError);
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
});

describe("compile", () => {
  it("throws when _rawTx is missing", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expect(
      svc.compile({
        signArgs: { transaction: delegateTx, fee, nonce: 0 } as never,
        signature: "sig",
      })
    ).rejects.toThrow(SigningError);
  });

  it("throws on empty signature", async () => {
    const { factory } = realSetup();
    const svc = createSignService(factory);
    await expect(
      svc.compile({
        signArgs: { transaction: delegateTx, fee, nonce: 0, _rawTx: UNSIGNED_FIXTURE } as never,
        signature: "",
      })
    ).rejects.toThrow(SigningError);
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
});
