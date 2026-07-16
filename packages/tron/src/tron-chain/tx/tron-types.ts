import type { BaseSignArgs, DelegateTransaction, UndelegateTransaction } from "@guardian-sdk/sdk";
import type { TronResource } from "../rpc/tron-rpc-types";

export type { TronResource };
export const SUN_PER_TRX = 1_000_000n;

export interface TronDelegateTransaction extends DelegateTransaction {
  resource: TronResource;
}
export interface TronUndelegateTransaction extends UndelegateTransaction {
  resource: TronResource;
}

/** Opaque TronWeb unsigned transaction (has txID, raw_data, raw_data_hex, signature[]). */
export type UnsignedTronTx = { txID: string; raw_data_hex?: string; signature?: string[] } & Record<
  string,
  unknown
>;

/** Sign args carrying the built raw tx through prehash -> compile (mirrors Cardano's _txBodyCbor). */
export interface TronSignArgs extends BaseSignArgs {
  _rawTx?: UnsignedTronTx;
}
