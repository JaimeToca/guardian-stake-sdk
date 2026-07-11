import { describe, it, expect, vi } from "vitest";
import { createFeeService } from "../../src/cardano-chain/services/fee-service";
import { ValidationError } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../../src/chain";
import {
  buildTransactionBody,
  buildSignedTransaction,
} from "../../src/cardano-chain/tx/tx-builder";
import { buildCertificates, buildWithdrawals } from "../../src/cardano-chain/tx/tx-helpers";
import protocolParamsFixture from "../fixtures/protocol_params.json";
import utxosFixture from "../fixtures/utxos.json";
import type {
  BlockfrostProtocolParams,
  BlockfrostUtxo,
} from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

/**
 * Real mainnet values, verified with @cardano-sdk/core.
 *
 * PAYMENT_ADDRESS: CIP-0019 official test vector (addr1q...)
 * POOL_ID: verified mainnet pool (bech32 checksum confirmed)
 *   cold key hash → 0f292fcaa02b8b2f9b3c8f9fd8e0bb21abedb692a6d5058df3ef2735
 */
const PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";
const POOL_ID = "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy";

const PARAMS = protocolParamsFixture as BlockfrostProtocolParams;
const UTXOS = utxosFixture as BlockfrostUtxo[];

/** Default: a registered stake key with 3 ADA of withdrawable rewards. */
const REGISTERED_ACCOUNT = {
  active: true,
  withdrawable_amount: "3000000",
} as any;

/** An unregistered (never-delegated) stake key — a first-time Delegate. */
const UNREGISTERED_ACCOUNT = null;

function makeRpcClient(params = PARAMS, utxos = UTXOS, account: unknown = REGISTERED_ACCOUNT) {
  return {
    getProtocolParams: vi.fn().mockResolvedValue(params),
    getUtxos: vi.fn().mockResolvedValue(utxos),
    getAccountOrNull: vi.fn().mockResolvedValue(account),
  };
}

describe("FeeService", () => {
  it("returns a UtxoFee for a Delegate transaction", async () => {
    const service = createFeeService(makeRpcClient() as any);

    const fee = await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    });

    expect(fee.type).toBe("UtxoFee");
  });

  it("applies the linear fee formula: total = min_fee_a * txSizeBytes + min_fee_b", async () => {
    const service = createFeeService(makeRpcClient() as any);

    const fee = (await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    const baseFee = BigInt(PARAMS.min_fee_a) * BigInt(fee.txSizeBytes) + BigInt(PARAMS.min_fee_b);
    expect(fee.total).toBe(baseFee + (baseFee * 10n) / 100n);
  });

  it("estimates a positive tx size in bytes", async () => {
    const service = createFeeService(makeRpcClient() as any);

    const fee = (await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    expect(fee.txSizeBytes).toBeGreaterThan(0);
  });

  it.each([
    {
      name: "Delegate",
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
      name: "Redelegate",
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
      name: "Undelegate",
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
      name: "Claim",
      tx: {
        type: "ClaimRewards" as const,
        chain: cardanoMainnet,
        amount: 500_000n,
        validator: POOL_ID,
        account: PAYMENT_ADDRESS,
      },
    },
  ])("estimates fee for $name transaction", async ({ tx }) => {
    const service = createFeeService(makeRpcClient() as any);

    const fee = await service.estimateFee(tx as any);

    expect(fee.type).toBe("UtxoFee");
    expect(fee.total).toBeGreaterThan(0n);
  });

  it("throws ValidationError when account is missing", async () => {
    const service = createFeeService(makeRpcClient() as any);

    await expect(
      service.estimateFee({
        type: "Delegate",
        chain: cardanoMainnet,
        amount: 5_000_000n,
        isMaxAmount: false,
        validator: POOL_ID,
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("throws ValidationError when account is not a valid payment address", async () => {
    const service = createFeeService(makeRpcClient() as any);

    await expect(
      service.estimateFee({
        type: "Delegate",
        chain: cardanoMainnet,
        amount: 5_000_000n,
        isMaxAmount: false,
        validator: POOL_ID,
        account: "not-a-cardano-address",
      })
    ).rejects.toSatisfy((err: unknown) => {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).code).toBe("INVALID_ADDRESS");
      return true;
    });
  });

  it("paginates UTXOs when the first page does not cover the staking target", async () => {
    const makeUtxo = (lovelaces: string, index: number): BlockfrostUtxo => ({
      tx_hash: "aa".repeat(32),
      tx_index: index,
      output_index: index,
      amount: [{ unit: "lovelace", quantity: lovelaces }],
      block: "bb".repeat(32),
      data_hash: null,
      inline_datum: null,
      reference_script_hash: null,
    });
    // Page 1: a FULL page (100 UTXOs) of dust totalling ~2 ADA — below the ~3.16 ADA
    // Delegate target (fee + 2 ADA deposit + minUtxo), so the selector must page on.
    const page1 = Array.from({ length: 100 }, (_, i) => makeUtxo("20000", i));
    const page2 = [makeUtxo("5000000", 100)];

    const rpc = {
      getProtocolParams: vi.fn().mockResolvedValue(PARAMS),
      getUtxos: vi.fn(async (_addr: string, page?: number) => (page === 2 ? page2 : page1)),
      getAccountOrNull: vi.fn().mockResolvedValue(UNREGISTERED_ACCOUNT),
    };
    const service = createFeeService(rpc as any);

    const fee = await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    });

    expect(fee.type).toBe("UtxoFee");
    expect(fee.total).toBeGreaterThan(0n);
    expect(rpc.getUtxos).toHaveBeenCalledWith(PAYMENT_ADDRESS, 2, 100);
  });

  it("unregistered Delegate has more CBOR bytes than a registered Redelegate (registration cert adds size)", async () => {
    // First-time Delegate: stake key not yet registered → StakeRegistration cert added.
    const delegateFee = (await createFeeService(
      makeRpcClient(PARAMS, UTXOS, UNREGISTERED_ACCOUNT) as any
    ).estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    // Redelegate on an already-registered key: StakeDelegation only.
    const redelegateFee = (await createFeeService(
      makeRpcClient(PARAMS, UTXOS, REGISTERED_ACCOUNT) as any
    ).estimateFee({
      type: "Redelegate",
      chain: cardanoMainnet,
      amount: 0n,
      isMaxAmount: false,
      fromValidator: POOL_ID,
      toValidator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    // Delegate = StakeRegistration + StakeDelegation; Redelegate = StakeDelegation only
    expect(delegateFee.txSizeBytes).toBeGreaterThan(redelegateFee.txSizeBytes);
  });
});

/**
 * Regression + correctness verification for the fee CALCULATION itself.
 *
 * Two guarantees are pinned here:
 *  1. Exact fee totals for each staking type against the mainnet fixture params
 *     (min_fee_a=44, min_fee_b=155381), so any drift in the size model or buffer
 *     is caught. The fixture's single 10-ADA pure-ADA UTXO covers every staking
 *     target as ONE input, matching a typical wallet.
 *  2. The returned (buffered) fee is never below the node's real minimum fee for
 *     the transaction that `sign()` actually submits. The signed tx differs from
 *     the estimator's mock: it carries TWO DISTINCT vkey witnesses (payment +
 *     staking — the mock's identical zero witnesses collapse to one in the CBOR
 *     set), a TTL, and a full-balance withdrawal for both ClaimRewards AND
 *     Undelegate. This test reconstructs that real shape and asserts the buffer
 *     still covers it — the property that keeps the node from rejecting the tx.
 */
describe("FeeService — fee calculation correctness", () => {
  const A = BigInt(PARAMS.min_fee_a);
  const B = BigInt(PARAMS.min_fee_b);
  const REWARDS_ON_CHAIN = 3_000_000n; // representative reward balance swept by Claim/Undelegate
  const STAKE_HASH = "00".repeat(28);

  const TXS = {
    Delegate: {
      type: "Delegate" as const,
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    },
    Redelegate: {
      type: "Redelegate" as const,
      chain: cardanoMainnet,
      amount: 0n,
      isMaxAmount: false,
      fromValidator: POOL_ID,
      toValidator: POOL_ID,
      account: PAYMENT_ADDRESS,
    },
    Undelegate: {
      type: "Undelegate" as const,
      chain: cardanoMainnet,
      amount: 0n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    },
    ClaimRewards: {
      type: "ClaimRewards" as const,
      chain: cardanoMainnet,
      amount: 500_000n,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    },
  };

  // Exact totals produced by `estimateFee` for the single-input fixture wallet
  // (registered stake key with 3 ADA of rewards; see REGISTERED_ACCOUNT).
  // = (44 * mockSizeBytes + 155381) * 1.10, rounded down by bigint division.
  // Delegate == Redelegate here because both are a single StakeDelegation cert on
  // an already-registered key; Undelegate adds a deregistration cert + reward sweep.
  const EXPECTED_TOTAL: Record<keyof typeof TXS, bigint> = {
    Delegate: 189_891n,
    Redelegate: 189_891n,
    Undelegate: 190_279n,
    ClaimRewards: 188_536n,
  };

  it.each(Object.keys(TXS) as (keyof typeof TXS)[])(
    "%s: returns the exact expected fee total for the fixture wallet",
    async (name) => {
      const fee = (await createFeeService(makeRpcClient() as any).estimateFee(
        TXS[name] as any
      )) as any;
      expect(fee.type).toBe("UtxoFee");
      expect(fee.total).toBe(EXPECTED_TOTAL[name]);
      // And the total is exactly the linear formula on the reported size, +10%.
      const base = A * BigInt(fee.txSizeBytes) + B;
      expect(fee.total).toBe(base + (base * 10n) / 100n);
    }
  );

  it.each(Object.keys(TXS) as (keyof typeof TXS)[])(
    "%s: estimated fee covers the node minimum for the actually-signed tx",
    async (name) => {
      const tx = TXS[name];
      const fee = (await createFeeService(makeRpcClient() as any).estimateFee(tx as any)) as any;

      // Reconstruct the tx `sign()` really submits: registered key (typical),
      // TWO DISTINCT witnesses, a TTL, and the full reward sweep for Claim/Undelegate.
      const certs = buildCertificates(tx as any, STAKE_HASH, /* isStakeKeyRegistered */ true);
      const withdrawals = buildWithdrawals(tx as any, STAKE_HASH, REWARDS_ON_CHAIN);
      const body = buildTransactionBody({
        inputs: [{ txHashHex: "aa".repeat(32), index: 0 }],
        outputAddress: PAYMENT_ADDRESS,
        outputLovelaces: 3_000_000n,
        fee: fee.total,
        ttl: 140_000_000,
        certificates: certs.length ? certs : undefined,
        withdrawals: withdrawals.size ? withdrawals : undefined,
      });
      const signedCbor = buildSignedTransaction(body, [
        { vkeyHex: "00".repeat(32), sigHex: "00".repeat(64) },
        { vkeyHex: "11".repeat(32), sigHex: "11".repeat(64) },
      ]);
      const realBytes = signedCbor.length / 2;
      const nodeMinFee = A * BigInt(realBytes) + B;

      // Lower bound (never rejected): the fee handed to the signer must be >= what
      // the node requires for the real signed transaction.
      expect(fee.total).toBeGreaterThanOrEqual(nodeMinFee);
      // Upper bound (faithful, not wildly over): the mock now matches the signed tx
      // shape (distinct witnesses, TTL, full reward sweep, real registration status),
      // so the estimate should sit within the 10% buffer of the node minimum — a
      // ceiling of 11% guards against any future over-estimation regression.
      expect(fee.total).toBeLessThanOrEqual((nodeMinFee * 111n) / 100n);
    }
  );
});
