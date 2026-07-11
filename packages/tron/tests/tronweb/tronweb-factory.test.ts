import { describe, it, expect } from "vitest";
import { createTronWebFactory } from "../../src/tron-chain/tronweb/tronweb-factory";

describe("createTronWebFactory", () => {
  it("creates a TronWeb client bound to the fullHost", () => {
    const factory = createTronWebFactory("https://node.example");
    const tw = factory.create();
    expect(tw.fullNode.host).toBe("https://node.example");
  });
});
