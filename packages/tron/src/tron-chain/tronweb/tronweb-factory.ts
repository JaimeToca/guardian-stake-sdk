import { TronWeb } from "tronweb";

export interface TronWebFactory {
  create(privateKey?: string): TronWeb;
}

export function createTronWebFactory(fullHost: string): TronWebFactory {
  return {
    create(privateKey) {
      return new TronWeb({ fullHost, ...(privateKey ? { privateKey } : {}) });
    },
  };
}
