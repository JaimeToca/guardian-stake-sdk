import { NoopLogger, ValidationError } from "@guardian-sdk/sdk";
import type { Logger } from "@guardian-sdk/sdk";
import type { BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import type { TxInput } from "./tx-builder";
import { parseLovelaceString } from "../validations";

/**
 * Babbage-era default for `coins_per_utxo_size` (lovelaces per serialised byte).
 * Used as a fallback when the protocol parameter is unavailable.
 */
export const DEFAULT_COINS_PER_UTXO_SIZE = "4310";

/** UTXOs fetched per Blockfrost page (the API maximum). */
export const DEFAULT_UTXO_PAGE_SIZE = 100;

/**
 * Hard bound on how many UTXO pages `selectUtxosPaged` will pull. Staking spends
 * are small (≤ ~3.2 ADA), so page 1 covers virtually every wallet; the cap only
 * matters for pathological wallets (thousands of dust or native-token UTXOs).
 */
export const DEFAULT_MAX_UTXO_PAGES = 5;

export interface SelectedUtxos {
  inputs: TxInput[];
  totalLovelaces: bigint;
}

/** Lovelace held by a UTXO if it is pure-ADA (single lovelace asset), else 0n. */
export function pureAdaLovelace(utxo: BlockfrostUtxo): bigint {
  const isAdaOnly = utxo.amount.length === 1 && utxo.amount[0].unit === "lovelace";
  if (!isAdaOnly) return 0n;
  return parseLovelaceString(utxo.amount[0].quantity, "utxo quantity");
}

/**
 * Largest-first UTXO selection, restricted to pure-ADA UTXOs.
 *
 * @throws ValidationError if insufficient funds or if native-token UTXOs must be consumed.
 */
export function selectUtxos(utxos: BlockfrostUtxo[], requiredLovelaces: bigint): SelectedUtxos {
  if (requiredLovelaces < 0n) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      `requiredLovelaces must be non-negative, got ${requiredLovelaces}.`
    );
  }

  const withLovelaces = utxos
    .map((utxo) => {
      const lovelaceEntry = utxo.amount.find((a) => a.unit === "lovelace");
      const lovelaces = lovelaceEntry
        ? parseLovelaceString(lovelaceEntry.quantity, "utxo quantity")
        : 0n;
      const isAdaOnly = utxo.amount.length === 1 && utxo.amount[0].unit === "lovelace";

      return { utxo, lovelaces, isAdaOnly };
    })
    .filter(({ lovelaces }) => lovelaces > 0n)
    // ADA-only UTXOs first so they are exhausted before touching any multi-asset UTXO.
    .sort((a, b) => {
      if (a.isAdaOnly !== b.isAdaOnly) return a.isAdaOnly ? -1 : 1;
      return b.lovelaces > a.lovelaces ? 1 : b.lovelaces < a.lovelaces ? -1 : 0;
    });

  const selected: typeof withLovelaces = [];
  let total = 0n;

  for (const entry of withLovelaces) {
    if (total >= requiredLovelaces) break;
    if (!entry.isAdaOnly) {
      throw new ValidationError(
        "UNSUPPORTED_OPERATION",
        "Native token UTXOs are not yet supported. Move your tokens to a separate address before staking."
      );
    }
    selected.push(entry);
    total += entry.lovelaces;
  }

  if (total < requiredLovelaces) {
    const ada = (requiredLovelaces / 1_000_000n).toString();
    throw new ValidationError(
      "INVALID_AMOUNT",
      `Insufficient funds: need at least ${ada} ADA but wallet UTXOs only cover ${(total / 1_000_000n).toString()} ADA.`
    );
  }

  return {
    inputs: selected.map(({ utxo }) => ({ txHashHex: utxo.tx_hash, index: utxo.output_index })),
    totalLovelaces: total,
  };
}

export interface SelectUtxosPagedOptions {
  /** Fetches one page of UTXOs (1-indexed). Wraps `rpcClient.getUtxos(address, page, count)`. */
  fetchPage: (page: number, count: number) => Promise<BlockfrostUtxo[]>;
  /** Page 1, if already fetched (e.g. in the caller's parallel batch) — avoids a redundant request. */
  seedPage?: BlockfrostUtxo[];
  maxPages?: number;
  pageSize?: number;
  logger?: Logger;
}

/**
 * Lazily paginates a payment address's UTXOs and returns a selection covering
 * `targetLovelace`.
 *
 * Blockfrost cannot sort UTXOs by amount, and fetching every page of a large
 * wallet just to move a few ADA is wasteful. Since staking spends are small and
 * bounded, this accumulates pages only until the running pure-ADA total reaches
 * `targetLovelace`, then stops. It pulls at most `maxPages` pages.
 *
 * Stop conditions:
 * - pure-ADA accumulated ≥ target → collect done, run largest-first selection.
 * - a short page (< pageSize) → the whole address has been scanned.
 * - `maxPages` reached → hard bound; error hints at consolidating dust.
 *
 * @throws ValidationError("INVALID_AMOUNT") if the spendable ADA-only balance is
 *   insufficient, with a message that distinguishes "fully scanned, not enough"
 *   from "hit the scan cap, more UTXOs may exist — consolidate".
 */
export async function selectUtxosPaged(
  targetLovelace: bigint,
  {
    fetchPage,
    seedPage,
    maxPages = DEFAULT_MAX_UTXO_PAGES,
    pageSize = DEFAULT_UTXO_PAGE_SIZE,
    logger = new NoopLogger(),
  }: SelectUtxosPagedOptions
): Promise<SelectedUtxos> {
  const collected: BlockfrostUtxo[] = [];
  let pureAda = 0n;
  let page = 1;
  let stop: "target-met" | "exhausted" | "cap" = "cap";

  while (page <= maxPages) {
    const batch = page === 1 && seedPage ? seedPage : await fetchPage(page, pageSize);
    collected.push(...batch);
    for (const utxo of batch) pureAda += pureAdaLovelace(utxo);

    if (pureAda >= targetLovelace) {
      stop = "target-met";
      break;
    }
    if (batch.length < pageSize) {
      stop = "exhausted";
      break;
    }
    page++;
  }

  logger.debug("selectUtxosPaged: collection finished", {
    pagesFetched: page,
    utxosConsidered: collected.length,
    pureAda: pureAda.toString(),
    target: targetLovelace.toString(),
    stop,
  });

  if (pureAda < targetLovelace) {
    throw new ValidationError(
      "INVALID_AMOUNT",
      stop === "cap"
        ? `Scanned the first ${collected.length} UTXOs but found only ${pureAda} lovelace in spendable ADA-only UTXOs ` +
            `(need ${targetLovelace}). Consolidate your wallet's many small UTXOs and try again.`
        : `Insufficient funds: need ${targetLovelace} lovelace but spendable ADA-only UTXOs total ${pureAda}.`
    );
  }

  // Guaranteed to succeed: pure-ADA ≥ target, and selectUtxos exhausts ADA-only
  // UTXOs (sorted first) before it would ever reach a native-token UTXO.
  return selectUtxos(collected, targetLovelace);
}
