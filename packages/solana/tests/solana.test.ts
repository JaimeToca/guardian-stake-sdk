import { describe, it, expect } from "vitest";
import { solana } from "../src/solana-chain";
import { solanaMainnet, chains } from "../src/chain";

describe("solana() factory", () => {
  it("returns chain info for solana mainnet", () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    expect(service.getChainInfo()).toEqual(solanaMainnet);
    expect(chains.solanaMainnet.id).toBe("solana-mainnet");
  });

  it("getNonce always returns 0", async () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    await expect(service.getNonce("any")).resolves.toBe(0);
  });

  it("exposes wired service methods", () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    expect(typeof service.getValidators).toBe("function");
    expect(typeof service.getDelegations).toBe("function");
    expect(typeof service.getBalances).toBe("function");
    expect(typeof service.estimateFee).toBe("function");
    expect(typeof service.sign).toBe("function");
    expect(typeof service.prehash).toBe("function");
    expect(typeof service.compile).toBe("function");
    expect(typeof service.broadcast).toBe("function");
  });
});
