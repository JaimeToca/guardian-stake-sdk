import { describe, it, expect } from "vitest";
import { NonceService } from "../../src/cardano-chain/services/nonce-service";

describe("NonceService", () => {
  const service = new NonceService();

  it("always returns 0 regardless of the address", async () => {
    const nonce = await service.getNonce(
      "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa"
    );
    expect(nonce).toBe(0);
  });

  it("returns 0 for a payment address", async () => {
    const nonce = await service.getNonce(
      "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgs68faae"
    );
    expect(nonce).toBe(0);
  });

  it("returns 0 for an empty string", async () => {
    const nonce = await service.getNonce("");
    expect(nonce).toBe(0);
  });

  it("returns 0 consistently across multiple calls", async () => {
    const address = "stake1ux3g2c9dx2nhhehyrezy4uvtyvgmndp3v4kplasjan2fcgfv7jyfa";
    const n1 = await service.getNonce(address);
    const n2 = await service.getNonce(address);
    const n3 = await service.getNonce(address);
    expect(n1).toBe(0);
    expect(n2).toBe(0);
    expect(n3).toBe(0);
  });

  it("returns a number (not bigint)", async () => {
    const nonce = await service.getNonce("any-address");
    expect(typeof nonce).toBe("number");
  });
});