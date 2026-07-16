import { TronWeb } from "tronweb";

export interface TronWebFactory {
  /**
   * Build a TronWeb client bound to `fullHost`.
   *
   * `privateKey` is optional so both signing modes are supported from one factory:
   * - **With a key** — TronWeb derives `defaultAddress` and can `trx.sign(...)`. Used by `sign()`.
   *   Accepts the same secp256k1 private key formats as BSC (with or without `0x` prefix).
   * - **Without a key (MPC / hardware wallet)** — no key is ever loaded; `defaultAddress` stays
   *   `false`. The client can still build unsigned txs and compute the prehash, but cannot sign.
   *   Used by `prehash()`/`compile()`, where signing happens externally.
   */
  create(privateKey?: string): TronWeb;
}

export function createTronWebFactory(fullHost: string): TronWebFactory {
  return {
    create(privateKey) {
      // Accept keys with or without 0x prefix (consistent with BSC and the shared
      // SDK privateKey() validator). TronWeb rejects the 0x prefix.
      let key = privateKey;
      if (key && (key.startsWith("0x") || key.startsWith("0X"))) {
        key = key.slice(2);
      }
      return new TronWeb({ fullHost, ...(key ? { privateKey: key } : {}) });
    },
  };
}
