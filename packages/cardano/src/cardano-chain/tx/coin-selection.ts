import { ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import type { TxInput } from "./tx-builder";
import { parseLovelaceString } from "../validations";

/**
 * Babbage-era default for `coins_per_utxo_size` (lovelaces per serialised byte).
 * Used as a fallback when the protocol parameter is unavailable.
 */
export const DEFAULT_COINS_PER_UTXO_SIZE = "4310";

export interface SelectedUtxos {
  inputs: TxInput[];
  totalLovelaces: bigint;
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
