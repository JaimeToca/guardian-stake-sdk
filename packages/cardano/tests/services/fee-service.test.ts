import { describe, it, expect, vi } from "vitest";
import { FeeService } from "../../src/cardano-chain/services/fee-service";
import { ValidationError } from "@guardian-sdk/sdk";
import { cardanoMainnet } from "../../src/chain";
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

function makeRpcClient(params = PARAMS, utxos = UTXOS) {
  return {
    getProtocolParams: vi.fn().mockResolvedValue(params),
    getUtxos: vi.fn().mockResolvedValue(utxos),
  };
}

describe("FeeService", () => {
  it("returns a UtxoFee for a Delegate transaction", async () => {
    const service = new FeeService(makeRpcClient() as any);

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
    const service = new FeeService(makeRpcClient() as any);

    const fee = (await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    expect(fee.total).toBe(
      BigInt(PARAMS.min_fee_a) * BigInt(fee.txSizeBytes) + BigInt(PARAMS.min_fee_b)
    );
  });

  it("estimates a positive tx size in bytes", async () => {
    const service = new FeeService(makeRpcClient() as any);

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
        type: "Claim" as const,
        chain: cardanoMainnet,
        amount: 500_000n,
        validator: POOL_ID,
        index: 0n,
        account: PAYMENT_ADDRESS,
      },
    },
  ])("estimates fee for $name transaction", async ({ tx }) => {
    const service = new FeeService(makeRpcClient() as any);

    const fee = await service.estimateFee(tx as any);

    expect(fee.type).toBe("UtxoFee");
    expect(fee.total).toBeGreaterThan(0n);
  });

  it("throws ValidationError when account is missing", async () => {
    const service = new FeeService(makeRpcClient() as any);

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
    const service = new FeeService(makeRpcClient() as any);

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

  it("Delegate tx has more CBOR bytes than Redelegate (registration cert adds size)", async () => {
    const service = new FeeService(makeRpcClient() as any);

    const delegateFee = (await service.estimateFee({
      type: "Delegate",
      chain: cardanoMainnet,
      amount: 5_000_000n,
      isMaxAmount: false,
      validator: POOL_ID,
      account: PAYMENT_ADDRESS,
    })) as any;

    const redelegateFee = (await service.estimateFee({
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
