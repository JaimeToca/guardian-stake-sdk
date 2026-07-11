import { describe, it, expect, vi } from "vitest";
import { ValidationError } from "@guardian-sdk/sdk";
import {
  selectUtxos,
  selectUtxosPaged,
  pureAdaLovelace,
} from "../../src/cardano-chain/tx/coin-selection";
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
  txHash = "cc".repeat(32),
  index = 0
): BlockfrostUtxo {
  return {
    tx_hash: txHash,
    tx_index: index,
    output_index: index,
    amount: [
      { unit: "lovelace", quantity: lovelaces },
      { unit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6d494e", quantity: "100" },
    ],
    block: "dd".repeat(32),
    data_hash: null,
    inline_datum: null,
    reference_script_hash: null,
  };
}

describe("selectUtxos", () => {
  it("selects the single UTXO when it covers the required amount", () => {
    const utxos = [makeUtxo("5000000")];
    const result = selectUtxos(utxos, 3_000_000n);

    expect(result.inputs).toHaveLength(1);
    expect(result.totalLovelaces).toBe(5_000_000n);
    expect(result.inputs[0].txHashHex).toBe("aa".repeat(32));
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
      amount: [
        { unit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6d494e", quantity: "100" },
      ],
      block: "ff".repeat(32),
      data_hash: null,
      inline_datum: null,
      reference_script_hash: null,
    };
    const normalUtxo = makeUtxo("5000000", "11".repeat(32), 0);

    const result = selectUtxos([noLovelaceUtxo, normalUtxo], 3_000_000n);

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
    it("succeeds using an ADA-only UTXO when a multi-asset UTXO is also present", () => {
      const adaOnly = makeUtxo("5000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo("5000000", "22".repeat(32));

      const result = selectUtxos([multiAsset, adaOnly], 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe("11".repeat(32));
    });

    it("prefers a smaller ADA-only UTXO over a larger multi-asset UTXO", () => {
      const adaOnly = makeUtxo("4000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo("8000000", "22".repeat(32));

      const result = selectUtxos([multiAsset, adaOnly], 3_000_000n);

      expect(result.inputs).toHaveLength(1);
      expect(result.inputs[0].txHashHex).toBe("11".repeat(32));
    });

    it("throws UNSUPPORTED_OPERATION when a multi-asset UTXO must be selected", () => {
      const adaOnly = makeUtxo("2000000", "11".repeat(32), 0);
      const multiAsset = makeMultiAssetUtxo("5000000", "22".repeat(32));

      expect(() => selectUtxos([adaOnly, multiAsset], 6_000_000n)).toSatisfy((fn: () => void) => {
        try {
          fn();
        } catch (e) {
          return (e as ValidationError).code === "UNSUPPORTED_OPERATION";
        }
        return false;
      });
    });

    it("throws UNSUPPORTED_OPERATION when only multi-asset UTXOs are available", () => {
      const multiAsset = makeMultiAssetUtxo("10000000", "33".repeat(32));

      expect(() => selectUtxos([multiAsset], 8_000_000n)).toSatisfy((fn: () => void) => {
        try {
          fn();
        } catch (e) {
          return (e as ValidationError).code === "UNSUPPORTED_OPERATION";
        }
        return false;
      });
    });
  });
});

describe("pureAdaLovelace", () => {
  it("returns the lovelace of an ADA-only UTXO", () => {
    expect(pureAdaLovelace(makeUtxo("5000000"))).toBe(5_000_000n);
  });

  it("returns 0n for a multi-asset UTXO (even though it holds lovelace)", () => {
    expect(pureAdaLovelace(makeMultiAssetUtxo("5000000"))).toBe(0n);
  });

  it("returns 0n for a UTXO with no lovelace entry", () => {
    const tokenOnly: BlockfrostUtxo = {
      ...makeUtxo("0"),
      amount: [
        { unit: "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6d494e", quantity: "1" },
      ],
    };
    expect(pureAdaLovelace(tokenOnly)).toBe(0n);
  });
});

/** Page fetcher over a fixed list of pages; records which pages were requested. */
function pager(pages: BlockfrostUtxo[][]) {
  const fetchPage = vi.fn(async (page: number) => pages[page - 1] ?? []);
  return { fetchPage };
}

const h = (n: number) => n.toString(16).padStart(2, "0").repeat(32);

describe("selectUtxosPaged", () => {
  it("stops on the seed page and makes no extra fetch when it already covers the target", async () => {
    const { fetchPage } = pager([]);
    const res = await selectUtxosPaged(3_000_000n, {
      fetchPage,
      seedPage: [makeUtxo("5000000", h(1))],
    });

    expect(res.inputs).toHaveLength(1);
    expect(res.totalLovelaces).toBe(5_000_000n);
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("fetches page 2 when the seed page is insufficient, then covers the target", async () => {
    const { fetchPage } = pager([[], [makeUtxo("5000000", h(2))]]);
    const res = await selectUtxosPaged(3_000_000n, {
      fetchPage,
      seedPage: [makeUtxo("1000000", h(1))], // full page (pageSize 1) but not enough
      pageSize: 1,
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(2, 1);
    // largest-first over the collected set picks the 5 ADA UTXO alone
    expect(res.inputs).toHaveLength(1);
    expect(res.inputs[0].txHashHex).toBe(h(2));
  });

  it("throws 'insufficient funds' when the address is fully scanned (short page)", async () => {
    const { fetchPage } = pager([]);
    await expect(
      selectUtxosPaged(3_000_000n, {
        fetchPage,
        seedPage: [makeUtxo("500000", h(1))], // 0.5 ADA, short page → whole address scanned
        pageSize: 2,
      })
    ).rejects.toSatisfy((e: unknown) => {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).code).toBe("INVALID_AMOUNT");
      expect((e as Error).message).toMatch(/Insufficient funds/);
      return true;
    });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it("throws a 'consolidate' error when the page cap is hit with full pages", async () => {
    const { fetchPage } = pager([[], [makeUtxo("100000", h(2))]]);
    await expect(
      selectUtxosPaged(3_000_000n, {
        fetchPage,
        seedPage: [makeUtxo("100000", h(1))],
        pageSize: 1, // every page is "full", so we never hit the exhausted branch
        maxPages: 2,
      })
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as ValidationError).code).toBe("INVALID_AMOUNT");
      expect((e as Error).message).toMatch(/[Cc]onsolidate/);
      return true;
    });
    expect(fetchPage).toHaveBeenCalledTimes(1); // page 2 fetched, then cap
  });

  it("skips a native-token-only page and pages on to find spendable ADA", async () => {
    const { fetchPage } = pager([[], [makeUtxo("5000000", h(2))]]);
    const res = await selectUtxosPaged(3_000_000n, {
      fetchPage,
      seedPage: [makeMultiAssetUtxo("5000000", h(1))], // pure-ADA contribution is 0
      pageSize: 1,
    });

    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(res.inputs).toHaveLength(1);
    expect(res.inputs[0].txHashHex).toBe(h(2));
  });

  it("selects zero inputs for a zero target", async () => {
    const { fetchPage } = pager([]);
    const res = await selectUtxosPaged(0n, { fetchPage, seedPage: [makeUtxo("1000000", h(1))] });

    expect(res.inputs).toHaveLength(0);
    expect(res.totalLovelaces).toBe(0n);
  });

  it("handles pure sum exactly equal to the target", async () => {
    const { fetchPage } = pager([]);
    const res = await selectUtxosPaged(3_000_000n, {
      fetchPage,
      seedPage: [makeUtxo("3000000", h(1))],
    });

    expect(res.inputs).toHaveLength(1);
    expect(res.totalLovelaces).toBe(3_000_000n);
  });

  it("returns a strict subset when the collected set overshoots the target", async () => {
    const { fetchPage } = pager([]);
    const res = await selectUtxosPaged(3_000_000n, {
      fetchPage,
      seedPage: [makeUtxo("10000000", h(1)), makeUtxo("5000000", h(2))],
    });

    expect(res.inputs).toHaveLength(1); // 10 ADA alone covers 3 ADA
    expect(res.totalLovelaces).toBe(10_000_000n);
  });

  it("hits the cap when every page is native-token-only (no spendable ADA)", async () => {
    const { fetchPage } = pager([[], [makeMultiAssetUtxo("9000000", h(2))]]);
    await expect(
      selectUtxosPaged(1_000_000n, {
        fetchPage,
        seedPage: [makeMultiAssetUtxo("9000000", h(1))],
        pageSize: 1,
        maxPages: 2,
      })
    ).rejects.toSatisfy((e: unknown) => {
      expect((e as ValidationError).code).toBe("INVALID_AMOUNT");
      expect((e as Error).message).toMatch(/[Cc]onsolidate/);
      return true;
    });
  });
});
