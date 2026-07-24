import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchOrError, ValidationError } from "@guardian-sdk/sdk";
import type * as SdkModule from "@guardian-sdk/sdk";
import { createBlockfrostRpcClient } from "../../src/cardano-chain/rpc/blockfrost-rpc-client";

// Mock only `fetchOrError` (the shared axios helper) and keep every other real sdk export.
vi.mock("@guardian-sdk/sdk", async (importActual) => {
  const actual = await importActual<typeof SdkModule>();
  return { ...actual, fetchOrError: vi.fn() };
});

const mockedFetch = vi.mocked(fetchOrError);

beforeEach(() => {
  mockedFetch.mockReset();
  mockedFetch.mockResolvedValue({} as never);
});

const VALID_STAKE_ADDRESS = "stake1uyehkck0lajq8gr28t9uxnuvgcqrc6070x3k9r8048z8y5gh6ffgw";
const VALID_PAYMENT_ADDRESS =
  "addr1qx2fxv2umyhttkxyxp8x0dlpdt3k6cwng5pxj3jhsydzer3n0d3vllmyqwsx5wktcd8cc3sq835lu7drv2xwl2wywfgse35a3x";

describe("BlockfrostRpcClient — M-CARDANO-1 defensive address encoding", () => {
  describe("getAccount", () => {
    it("rejects a stake address containing a path-traversal segment before building the URL", async () => {
      const rpc = createBlockfrostRpcClient(undefined);

      await expect(
        rpc.getAccount(`${VALID_STAKE_ADDRESS}/../../pools/extended`)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it("rejects a stake address containing a query-string injection attempt", async () => {
      const rpc = createBlockfrostRpcClient(undefined);

      await expect(rpc.getAccount(`${VALID_STAKE_ADDRESS}?foo=bar`)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it("never lets a `/` or `?` character reach the constructed request URL", async () => {
      const rpc = createBlockfrostRpcClient(undefined);
      const malicious = `${VALID_STAKE_ADDRESS}/../../admin?x=1`;

      await expect(rpc.getAccount(malicious)).rejects.toThrow();

      // Whether via throw-before-fetch or safe-encoding, no call must have gone
      // out with raw `/` or `?` injected into the path.
      for (const call of mockedFetch.mock.calls) {
        const config = call[0] as { url?: string };
        if (config.url) {
          expect(config.url.includes("/../")).toBe(false);
          expect(config.url).not.toContain("?x=1");
        }
      }
    });

    it("accepts a well-formed stake address unchanged (no behavior change on the valid path)", async () => {
      mockedFetch.mockResolvedValue({
        stake_address: VALID_STAKE_ADDRESS,
        active: true,
        active_epoch: 210,
        controlled_amount: "10000000",
        rewards_sum: "1500000",
        withdrawals_sum: "1000000",
        reserves_sum: "0",
        treasury_sum: "0",
        withdrawable_amount: "500000",
        pool_id: "pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy",
      } as never);
      const rpc = createBlockfrostRpcClient(undefined);

      const account = await rpc.getAccount(VALID_STAKE_ADDRESS);

      expect(account.stake_address).toBe(VALID_STAKE_ADDRESS);
      const config = mockedFetch.mock.calls[0][0] as { url?: string };
      expect(config.url).toBe(
        `https://cardano-mainnet.blockfrost.io/api/v0/accounts/${VALID_STAKE_ADDRESS}`
      );
    });
  });

  describe("getAccountOrNull", () => {
    it("rejects an injected stake address before building the URL", async () => {
      const rpc = createBlockfrostRpcClient(undefined);

      await expect(
        rpc.getAccountOrNull(`${VALID_STAKE_ADDRESS}/../secrets`)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockedFetch).not.toHaveBeenCalled();
    });
  });

  describe("getUtxos", () => {
    it("rejects a payment address containing a path segment before building the URL", async () => {
      const rpc = createBlockfrostRpcClient(undefined);

      await expect(rpc.getUtxos(`${VALID_PAYMENT_ADDRESS}/../../pools`)).rejects.toBeInstanceOf(
        ValidationError
      );
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it("accepts a well-formed payment address unchanged", async () => {
      mockedFetch.mockResolvedValue([] as never);
      const rpc = createBlockfrostRpcClient(undefined);

      const utxos = await rpc.getUtxos(VALID_PAYMENT_ADDRESS);

      expect(utxos).toEqual([]);
      const config = mockedFetch.mock.calls[0][0] as { url?: string };
      expect(config.url).toBe(
        `https://cardano-mainnet.blockfrost.io/api/v0/addresses/${VALID_PAYMENT_ADDRESS}/utxos`
      );
    });
  });
});
