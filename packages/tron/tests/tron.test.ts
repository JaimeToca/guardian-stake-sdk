import { describe, it, expect } from "vitest";
import { tron } from "../src/tron-chain";
import { ConfigError } from "@guardian-sdk/sdk";

describe("tron()", () => {
  it("returns a contract with the Tron chain info", () => {
    const svc = tron({ rpcUrl: "https://node.example" });
    expect(svc.getChainInfo().id).toBe("tron-mainnet");
    expect(svc.getChainInfo().decimals).toBe(6);
  });
  it("rejects an invalid rpcUrl", () => {
    expect(() => tron({ rpcUrl: "not-a-url" })).toThrow(ConfigError);
  });
  it("getNonce always resolves to 0", async () => {
    expect(await tron({ rpcUrl: "https://node.example" }).getNonce("TWallet")).toBe(0);
  });
});
