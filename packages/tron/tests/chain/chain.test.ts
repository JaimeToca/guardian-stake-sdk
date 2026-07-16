import { describe, it, expect } from "vitest";
import { tronMainnet, getChainById } from "../../src/chain";

describe("tronMainnet", () => {
  it("has SUN decimals and TRX symbol", () => {
    expect(tronMainnet.decimals).toBe(6);
    expect(tronMainnet.symbol).toBe("TRX");
    expect(tronMainnet.type).toBe("Tron");
    expect(tronMainnet.ecosystem).toBe("Tron");
    expect(tronMainnet.chainId).toBeUndefined();
  });

  it("resolves by id", () => {
    expect(getChainById("tron-mainnet")?.id).toBe("tron-mainnet");
  });
});
