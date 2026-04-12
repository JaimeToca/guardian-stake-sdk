import { ValidationError } from "@guardian-sdk/sdk";
import type { BlockfrostUtxo } from "../rpc/blockfrost-rpc-types";
import type { TxInput } from "./tx-builder";

/**
 * Babbage-era default for `coins_per_utxo_size` (lovelaces per serialised byte).
 * Used as a fallback when the protocol parameter is unavailable.
 */
export const DEFAULT_COINS_PER_UTXO_SIZE = "4310";

/**
 * Minimum UTxO size constant used in: minUTxO = (serializedOutputSize + 160) * coinsPerUTxOByte
 *
 * 160 = fixed UTxO entry overhead (key/value storage in the ledger map).
 * ~70 = typical CBOR size of a pure-ADA base-address output (57-byte address + amount + framing).
 * Total conservative estimate: 230 bytes → 4310 × 230 ≈ 991,300 lovelace ≈ 1 ADA minimum.
 */
export const UTXO_OUTPUT_SIZE_BYTES = 230n;

export interface SelectedUtxos {
  inputs: TxInput[];
  totalLovelaces: bigint;
}

/**
 * Largest-first UTXO selection.
 *
 * Selects UTXOs (ADA-only) until the total covers the required amount.
 * Multi-asset UTXOs are included if they have enough ADA but we track only the
 * lovelace component for balance purposes.
 *
 * @throws ValidationError if insufficient funds.
 */
export function selectUtxos(utxos: BlockfrostUtxo[], requiredLovelaces: bigint): SelectedUtxos {
  const withLovelaces = utxos
    .map((utxo) => {
      const lovelaceEntry = utxo.amount.find((a) => a.unit === "lovelace");
      const lovelaces = lovelaceEntry ? BigInt(lovelaceEntry.quantity) : 0n;
      return { utxo, lovelaces };
    })
    .filter(({ lovelaces }) => lovelaces > 0n)
    .sort((a, b) => (b.lovelaces > a.lovelaces ? 1 : b.lovelaces < a.lovelaces ? -1 : 0));

  const selected: Array<{ utxo: BlockfrostUtxo; lovelaces: bigint }> = [];
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
    index: utxo.tx_index,
  }));

  return { inputs, totalLovelaces: total };
}
