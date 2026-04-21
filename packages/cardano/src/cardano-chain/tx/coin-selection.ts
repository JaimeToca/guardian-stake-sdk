import { ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import type { TxInput } from "./tx-builder";

/**
 * Babbage-era default for `coins_per_utxo_size` (lovelaces per serialised byte).
 * Used as a fallback when the protocol parameter is unavailable.
 */
export const DEFAULT_COINS_PER_UTXO_SIZE = "4310";

export interface SelectedUtxos {
  inputs: TxInput[];
  totalLovelaces: bigint;
  /**
   * Native tokens from any multi-asset UTXOs that were selected.
   * These MUST be preserved in the change output — Cardano transactions
   * cannot drop native tokens. Undefined when only pure-ADA UTXOs were selected.
   */
  inputAssets?: Map<string, bigint>;
}

/**
 * Largest-first UTXO selection with ADA-only preference.
 *
 * Pure-ADA UTXOs are always preferred over multi-asset UTXOs to keep the
 * change output simple. Multi-asset UTXOs are only included when ADA-only
 * UTXOs cannot cover the required amount.
 *
 * When a multi-asset UTXO is selected, its native tokens are returned in
 * `inputAssets` so callers can include them in the change output. Dropping
 * them would produce an invalid transaction.
 *
 * @throws ValidationError if insufficient funds.
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
      const lovelaces = lovelaceEntry ? BigInt(lovelaceEntry.quantity) : 0n;
      const isAdaOnly = utxo.amount.length === 1 && utxo.amount[0].unit === "lovelace";
      return { utxo, lovelaces, isAdaOnly };
    })
    .filter(({ lovelaces }) => lovelaces > 0n)
    // ADA-only UTXOs first (largest lovelace), then multi-asset (largest lovelace).
    // This minimises the risk of pulling in native tokens unnecessarily.
    .sort((a, b) => {
      if (a.isAdaOnly !== b.isAdaOnly) return a.isAdaOnly ? -1 : 1;
      return b.lovelaces > a.lovelaces ? 1 : b.lovelaces < a.lovelaces ? -1 : 0;
    });

  const selected: typeof withLovelaces = [];
  let total = 0n;

  for (const entry of withLovelaces) {
    if (total >= requiredLovelaces) break;
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

  const inputs: TxInput[] = selected.map(({ utxo }) => ({
    txHashHex: utxo.tx_hash,
    index: utxo.output_index,
  }));

  // Collect native tokens from any selected multi-asset UTXOs.
  const inputAssets = new Map<string, bigint>();
  for (const { utxo, isAdaOnly } of selected) {
    if (!isAdaOnly) {
      for (const { unit, quantity } of utxo.amount) {
        if (unit !== "lovelace") {
          inputAssets.set(unit, (inputAssets.get(unit) ?? 0n) + BigInt(quantity));
        }
      }
    }
  }

  return {
    inputs,
    totalLovelaces: total,
    inputAssets: inputAssets.size > 0 ? inputAssets : undefined,
  };
}
