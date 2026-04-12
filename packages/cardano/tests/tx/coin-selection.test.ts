import { describe, it, expect } from "vitest";
import { ValidationError } from "@guardian-sdk/sdk";
import { selectUtxos } from "../../src/cardano-chain/tx/coin-selection";
import type { BlockfrostUtxo } from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

function makeUtxo(lovelaces: string, txHash = "aa".repeat(32), index = 0): BlockfrostUtxo {
  return {
    tx_hash: txHash,
    tx_index: index,
    output_index: index,
    amount: [{ unit: "lovelace", quantity: lovelaces }],
    block: "bb".repeat(32),
    data_hash: null,
    inline_datum: null,
    reference_script_hash: null,
  };
}

function makeMultiAssetUtxo(
  lovelaces: string,
  assets: Array<{ unit: string; quantity: string }>,
  txHash = "cc".repeat(32),
  index = 0
): BlockfrostUtxo {
  return {
    tx_hash: txHash,
    tx_index: index,
    output_index: index,
    amount: [{ unit: "lovelace", quantity: lovelaces }, ...assets],
    block: "dd".repeat(32),
    data_hash: null,
    inline_datum: null,
    reference_script_hash: null,
  };
}

const POLICY_ASSET = "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6d494e";

describe("selectUtxos", () => {
  it("selects the single UTXO when it covers the required amount", () => {
    const utxos = [makeUtxo("5000000")];
    const result = selectUtxos(utxos, 3_000_000n);

    expect(result.inputs).toHaveLength(1);
    expect(result.totalLovelaces).toBe(5_000_000n);
    expect(result.inputs[0].txHashHex).toBe("aa".repeat(32));
    expect(result.inputAssets).toBeUndefined();
  });

  it("selects the minimum number of UTXOs using largest-first order", () => {
    const utxos = [
      makeUtxo("1000000", "11".repeat(32), 0),
      makeUtxo("8000000", "22".repeat(32), 0),
      makeUtxo("3000000", "33".repeat(32), 0),
    ];

    // Need 5 ADA — largest-first picks the 8 ADA UTXO alone
    const result = selectUtxos(utxos, 5_000_000n);

    expect(result.inputs).toHaveLength(1);
    expect(result.totalLovelaces).toBe(8_000_000n);
    expect(result.inputs[0].txHashHex).toBe("22".repeat(32));
  });

  it("selects multiple UTXOs when one is not enough", () => {
    const utxos = [
      makeUtxo("3000000", "11".repeat(32), 0),
      makeUtxo("3000000", "22".repeat(32), 0),
    ];

    const result = selectUtxos(utxos, 5_000_000n);

    expect(result.inputs).toHaveLength(2);
    expect(result.totalLovelaces).toBe(6_000_000n);
  });

  it("throws ValidationError when UTXOs are insufficient", () => {
    const utxos = [makeUtxo("1000000")];

    expect(() => selectUtxos(utxos, 5_000_000n)).toThrow(ValidationError);
    expect(() => selectUtxos(utxos, 5_000_000n)).toSatisfy((fn: () => void) => {
      try {
        fn();
      } catch (e) {
        return (e as ValidationError).code === "INVALID_AMOUNT";
      }
      return false;
    });
  });

  it("throws when the UTXO list is empty", () => {
    expect(() => selectUtxos([], 1_000_000n)).toThrow(ValidationError);
  });

  it("ignores UTXOs that have no lovelace amount", () => {
    const noLovelaceUtxo: BlockfrostUtxo = {
      tx_hash: "ee".repeat(32),
      tx_index: 0,
      output_index: 0,
      amount: [{ unit: POLICY_ASSET, quantity: "100" }],
      block: "ff".repeat(32),
      data_hash: null,
      inline_datum: null,
      reference_script_hash: null,
    };
    const normalUtxo = makeUtxo("5000000", "11".repeat(32), 0);

    const result = selectUtxos([noLovelaceUtxo, normalUtxo], 3_000_000n);

    // Only the normal UTXO should be selected
    expect(result.inputs).toHaveLength(1);
    expect(result.inputs[0].txHashHex).toBe("11".repeat(32));
  });

  it("selects exactly as much as needed and stops", () => {
    const utxos = [
      makeUtxo("10000000", "11".repeat(32), 0),
      makeUtxo("5000000", "22".repeat(32), 0),
    ];

    // 10 ADA covers the requirement — the 5 ADA UTXO should not be selected
    const result = selectUtxos(utxos, 8_000_000n);

    expect(result.inputs).toHaveLength(1);
    expect(result.totalLovelaces).toBe(10_000_000n);
  });

  it("allows zero required amount with any UTXO present", () => {
    const utxos = [makeUtxo("1000000")];
    const result = selectUtxos(utxos, 0n);

    expect(result.inputs).toHaveLength(0);
    expect(result.totalLovelaces).toBe(0n);
  });

  describe("multi-asset UTXOs", () => {
    it("prefers ADA-only UTXOs over multi-asset UTXOs of equal lovelace", () => {
      const adaOnly = makeUtxo("5000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo(
        "5000000",
        [{ unit: POLICY_ASSET, quantity: "100" }],
        "22".repeat(32)
      );

      const result = selectUtxos([multiAsset, adaOnly], 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe("11".repeat(32));
      expect(result.inputAssets).toBeUndefined();
    });

    it("prefers a smaller ADA-only UTXO over a larger multi-asset UTXO", () => {
      const adaOnly = makeUtxo("4000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo(
        "8000000",
        [{ unit: POLICY_ASSET, quantity: "100" }],
        "22".repeat(32)
      );

      const result = selectUtxos([multiAsset, adaOnly], 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe("11".repeat(32));
      expect(result.inputAssets).toBeUndefined();
    });

    it("falls back to a multi-asset UTXO when ADA-only UTXOs are insufficient", () => {
      const adaOnly = makeUtxo("2000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo(
        "5000000",
        [{ unit: POLICY_ASSET, quantity: "100" }],
        "22".repeat(32)
      );

      const result = selectUtxos([adaOnly, multiAsset], 6_000_000n);

      expect(result.inputs).toHaveLength(2);
      expect(result.totalLovelaces).toBe(7_000_000n);
      expect(result.inputAssets).toBeDefined();
      expect(result.inputAssets!.get(POLICY_ASSET)).toBe(100n);
    });

    it("returns inputAssets with correct quantities when only multi-asset UTXOs cover the amount", () => {
      const multiAsset = makeMultiAssetUtxo(
        "10000000",
        [{ unit: POLICY_ASSET, quantity: "200" }],
        "33".repeat(32)
      );

      const result = selectUtxos([multiAsset], 8_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputAssets!.get(POLICY_ASSET)).toBe(200n);
    });

    it("accumulates native tokens from multiple selected multi-asset UTXOs", () => {
      const ma1 = makeMultiAssetUtxo(
        "3000000",
        [{ unit: POLICY_ASSET, quantity: "50" }],
        "11".repeat(32)
      );
      const ma2 = makeMultiAssetUtxo(
        "3000000",
        [{ unit: POLICY_ASSET, quantity: "75" }],
        "22".repeat(32)
      );

      const result = selectUtxos([ma1, ma2], 5_000_000n);

      expect(result.inputAssets!.get(POLICY_ASSET)).toBe(125n);
    });
  });
});
