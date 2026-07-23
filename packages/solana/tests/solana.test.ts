import { describe, it, expect } from "vitest";
import { ValidationError } from "@guardian-sdk/sdk";
import { solana } from "../src/solana-chain";
import { solanaMainnet, chains } from "../src/chain";

describe("solana() stub factory", () => {
  it("returns chain info for solana mainnet", () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    expect(service.getChainInfo()).toEqual(solanaMainnet);
    expect(chains.solanaMainnet.id).toBe("solana-mainnet");
  });

  it("getNonce always returns 0", async () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    await expect(service.getNonce("any")).resolves.toBe(0);
  });

  it("stubs throw UNSUPPORTED_OPERATION", () => {
    const service = solana({ rpcUrl: "https://api.mainnet-beta.solana.com" });
    try {
      void service.getValidators();
      expect.unreachable("expected getValidators to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect(err).toMatchObject({ code: "UNSUPPORTED_OPERATION" });
    }
  });
});
