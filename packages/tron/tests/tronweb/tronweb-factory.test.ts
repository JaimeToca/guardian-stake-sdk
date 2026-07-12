import { describe, it, expect } from "vitest";
import { createTronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";

// Throwaway secp256k1 key (private key = 1). Its Tron address is deterministic and public.
const TEST_PRIVATE_KEY = "0000000000000000000000000000000000000000000000000000000000000001";
const TEST_ADDRESS = "TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC";

describe("createTronWebFactory", () => {
  it("creates a TronWeb client bound to the fullHost", () => {
    const factory = createTronWebFactory("https://node.example");
    const tw = factory.create();
    expect(tw.fullNode.host).toBe("https://node.example");
  });

  it("derives defaultAddress from a private key so the client can sign", () => {
    const factory = createTronWebFactory("https://node.example");
    const tw = factory.create(TEST_PRIVATE_KEY);
    expect(tw.defaultAddress.base58).toBe(TEST_ADDRESS);
  });

  describe("MPC / hardware wallet (no private key)", () => {
    it("creates a usable client with no default signing address", () => {
      const factory = createTronWebFactory("https://node.example");
      const tw = factory.create();
      // No key was ever loaded — nothing to sign with, but the client is still usable for
      // building unsigned txs and computing the prehash (the external-signer flow).
      expect(tw.defaultAddress.base58).toBe(false);
      expect(tw.defaultAddress.hex).toBe(false);
      expect(tw.fullNode.host).toBe("https://node.example");
    });

    it("does not leak a key: an empty-string privateKey is treated as no key", () => {
      const factory = createTronWebFactory("https://node.example");
      const tw = factory.create("");
      expect(tw.defaultAddress.base58).toBe(false);
    });
  });
});
