import { describe, it, expect } from "vitest";
import { selectUtxos } from "../../src/cardano-chain/tx/coin-selection";
import { ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostUtxo } from "../../src/cardano-chain/rpc/blockfrost-rpc-types";

function makeUtxo(txHash: string, txIndex: number, lovelaces: bigint): BlockfrostUtxo {
  return {
    tx_hash: txHash,
    tx_index: txIndex,
    output_index: txIndex,
    amount: [{ unit: "lovelace", quantity: lovelaces.toString() }],
    block: "blockhash",
    data_hash: null,
    inline_datum: null,
    reference_script_hash: null,
  };
}

function makeTxHash(n: number): string {
  return n.toString(16).padStart(64, "0");
}

describe("selectUtxos", () => {
  describe("basic selection", () => {
    it("selects a single UTXO that exactly covers the requirement", () => {
      const utxos = [makeUtxo(makeTxHash(1), 0, 5_000_000n)];
      const result = selectUtxos(utxos, 5_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe(makeTxHash(1));
      expect(result.inputs[0].index).toBe(0);
      expect(result.totalLovelaces).toBe(5_000_000n);
    });

    it("selects a single UTXO that more than covers the requirement", () => {
      const utxos = [makeUtxo(makeTxHash(1), 0, 10_000_000n)];
      const result = selectUtxos(utxos, 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.totalLovelaces).toBe(10_000_000n);
    });

    it("selects multiple UTXOs when no single UTXO is sufficient", () => {
      const utxos = [
        makeUtxo(makeTxHash(1), 0, 2_000_000n),
        makeUtxo(makeTxHash(2), 0, 2_000_000n),
        makeUtxo(makeTxHash(3), 0, 2_000_000n),
      ];
      const result = selectUtxos(utxos, 5_000_000n);

      expect(result.totalLovelaces).toBeGreaterThanOrEqual(5_000_000n);
      expect(result.inputs.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("largest-first ordering", () => {
    it("selects the largest UTXO first", () => {
      const utxos = [
        makeUtxo(makeTxHash(1), 0, 1_000_000n),
        makeUtxo(makeTxHash(2), 0, 10_000_000n),
        makeUtxo(makeTxHash(3), 0, 3_000_000n),
      ];
      const result = selectUtxos(utxos, 5_000_000n);

      // Should select the 10 ADA UTXO alone
      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe(makeTxHash(2));
      expect(result.totalLovelaces).toBe(10_000_000n);
    });

    it("selects fewest UTXOs using largest-first", () => {
      const utxos = [
        makeUtxo(makeTxHash(1), 0, 1_000_000n),
        makeUtxo(makeTxHash(2), 0, 1_000_000n),
        makeUtxo(makeTxHash(3), 0, 5_000_000n),
      ];
      const result = selectUtxos(utxos, 4_000_000n);

      // 5 ADA UTXO should be picked first and alone satisfies 4 ADA requirement
      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe(makeTxHash(3));
    });
  });

  describe("UTXO filtering", () => {
    it("ignores UTXOs with no lovelace amount entry", () => {
      const utxos: BlockfrostUtxo[] = [
        {
          tx_hash: makeTxHash(1),
          tx_index: 0,
          output_index: 0,
          amount: [{ unit: "policy123", quantity: "1000" }], // native token, no ADA
          block: "block",
          data_hash: null,
          inline_datum: null,
          reference_script_hash: null,
        },
        makeUtxo(makeTxHash(2), 0, 5_000_000n),
      ];
      const result = selectUtxos(utxos, 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe(makeTxHash(2));
    });

    it("includes multi-asset UTXOs if they have enough ADA", () => {
      const multiAssetUtxo: BlockfrostUtxo = {
        tx_hash: makeTxHash(1),
        tx_index: 0,
        output_index: 0,
        amount: [
          { unit: "lovelace", quantity: "10000000" },
          { unit: "policy123asset", quantity: "500" },
        ],
        block: "block",
        data_hash: null,
        inline_datum: null,
        reference_script_hash: null,
      };
      const result = selectUtxos([multiAssetUtxo], 5_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.totalLovelaces).toBe(10_000_000n);
    });

    it("ignores UTXOs with zero lovelaces", () => {
      const utxos = [
        makeUtxo(makeTxHash(1), 0, 0n),
        makeUtxo(makeTxHash(2), 0, 5_000_000n),
      ];
      const result = selectUtxos(utxos, 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe(makeTxHash(2));
    });
  });

  describe("input mapping", () => {
    it("maps tx_hash and tx_index from UTXO to TxInput", () => {
      const utxo = makeUtxo(makeTxHash(42), 3, 10_000_000n);
      const result = selectUtxos([utxo], 5_000_000n);

      expect(result.inputs[0]).toEqual({
        txHashHex: makeTxHash(42),
        index: 3,
      });
    });
  });

  describe("zero requirement", () => {
    it("selects no UTXOs when requirement is 0 and UTXOs are present", () => {
      const utxos = [makeUtxo(makeTxHash(1), 0, 5_000_000n)];
      const result = selectUtxos(utxos, 0n);

      expect(result.inputs).toHaveLength(0);
      expect(result.totalLovelaces).toBe(0n);
    });

    it("succeeds with an empty UTXO list when requirement is 0", () => {
      const result = selectUtxos([], 0n);

      expect(result.inputs).toHaveLength(0);
      expect(result.totalLovelaces).toBe(0n);
    });
  });

  describe("insufficient funds", () => {
    it("throws INVALID_AMOUNT when there are no UTXOs", () => {
      expect(() => selectUtxos([], 5_000_000n)).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_AMOUNT");
        return true;
      });
    });

    it("throws INVALID_AMOUNT when total lovelaces are less than required", () => {
      const utxos = [
        makeUtxo(makeTxHash(1), 0, 1_000_000n),
        makeUtxo(makeTxHash(2), 0, 1_000_000n),
      ];
      expect(() => selectUtxos(utxos, 5_000_000n)).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_AMOUNT");
        return true;
      });
    });

    it("throws INVALID_AMOUNT with a message showing the ADA amounts", () => {
      const utxos = [makeUtxo(makeTxHash(1), 0, 1_000_000n)];
      expect(() => selectUtxos(utxos, 5_000_000n)).toThrow(/5 ADA/);
    });

    it("throws INVALID_AMOUNT when all UTXOs have no lovelace entry", () => {
      const utxos: BlockfrostUtxo[] = [
        {
          tx_hash: makeTxHash(1),
          tx_index: 0,
          output_index: 0,
          amount: [{ unit: "nativetoken", quantity: "1000" }],
          block: "block",
          data_hash: null,
          inline_datum: null,
          reference_script_hash: null,
        },
      ];
      expect(() => selectUtxos(utxos, 1_000_000n)).toSatisfy((thrown: unknown) => {
        expect(thrown).toBeInstanceOf(ValidationError);
        expect((thrown as ValidationError).code).toBe("INVALID_AMOUNT");
        return true;
      });
    });
  });
});