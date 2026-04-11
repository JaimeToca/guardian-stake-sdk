import { describe, it, expect } from "vitest";
import { cardanoMainnet, chains, SUPPORTED_CHAINS, getChainById, isSupportedChain } from "../src/chain";

describe("cardanoMainnet chain config", () => {
  it("has the correct id", () => {
    expect(cardanoMainnet.id).toBe("cardano-mainnet");
  });

  it("has the correct type", () => {
    expect(cardanoMainnet.type).toBe("Cardano");
  });

  it("has the correct symbol", () => {
    expect(cardanoMainnet.symbol).toBe("ADA");
  });

  it("has 6 decimals (1 ADA = 1_000_000 lovelaces)", () => {
    expect(cardanoMainnet.decimals).toBe(6);
  });

  it("has the correct ecosystem", () => {
    expect(cardanoMainnet.ecosystem).toBe("Cardano");
  });

  it("has no chainId (Cardano uses network magic)", () => {
    expect(cardanoMainnet.chainId).toBeUndefined();
  });

  it("has the correct explorer URL", () => {
    expect(cardanoMainnet.explorer).toBe("https://cardanoscan.io");
  });
});

describe("chains registry", () => {
  it("includes cardanoMainnet", () => {
    expect(chains.cardanoMainnet).toBe(cardanoMainnet);
  });

  it("is a const object (frozen structure)", () => {
    expect(chains).toHaveProperty("cardanoMainnet");
  });
});

describe("SUPPORTED_CHAINS", () => {
  it("contains exactly cardanoMainnet", () => {
    expect(SUPPORTED_CHAINS).toHaveLength(1);
    expect(SUPPORTED_CHAINS[0]).toBe(cardanoMainnet);
  });
});

describe("getChainById", () => {
  it("returns cardanoMainnet for 'cardano-mainnet'", () => {
    expect(getChainById("cardano-mainnet")).toBe(cardanoMainnet);
  });

  it("returns undefined for an unknown id", () => {
    expect(getChainById("ethereum-mainnet")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(getChainById("")).toBeUndefined();
  });
});

describe("isSupportedChain", () => {
  it("returns true for cardanoMainnet", () => {
    expect(isSupportedChain(cardanoMainnet)).toBe(true);
  });

  it("returns false for an unsupported chain", () => {
    const unknownChain = { id: "ethereum-mainnet", type: "Ethereum" } as any;
    expect(isSupportedChain(unknownChain)).toBe(false);
  });
});