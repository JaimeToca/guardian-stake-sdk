import { TronWeb } from "tronweb";

export interface TronWebFactory {
  /**
   * Build a TronWeb client bound to `fullHost`.
   *
   * `privateKey` is optional so both signing modes are supported from one factory:
   * - **With a key** — TronWeb derives `defaultAddress` and can `trx.sign(...)`. Used by `sign()`.
   * - **Without a key (MPC / hardware wallet)** — no key is ever loaded; `defaultAddress` stays
   *   `false`. The client can still build unsigned txs and compute the prehash, but cannot sign.
   *   Used by `prehash()`/`compile()`, where signing happens externally.
   */
  create(privateKey?: string): TronWeb;
}

export function createTronWebFactory(fullHost: string): TronWebFactory {
  return {
    create(privateKey) {
      return new TronWeb({ fullHost, ...(privateKey ? { privateKey } : {}) });
    },
  };
}
