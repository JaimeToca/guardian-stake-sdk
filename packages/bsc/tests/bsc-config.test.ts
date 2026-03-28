import { describe, it, expect } from "vitest";
import { bsc } from "../src/smartchain/index";
import { ConfigError } from "@guardian/sdk";

describe("bsc() config validation", () => {
  it("accepts a valid https url", () => {
    expect(() => bsc({ rpcUrl: "https://bsc-dataseed.bnbchain.org" })).not.toThrow();
  });

  it("accepts a valid wss url", () => {
    expect(() => bsc({ rpcUrl: "wss://bsc-ws-node.example.com" })).not.toThrow();
  });

  it("throws ConfigError for an invalid url", () => {
    expect(() => bsc({ rpcUrl: "not-a-url" })).toThrow(ConfigError);
  });

  it("throws ConfigError for an unsupported protocol", () => {
    expect(() => bsc({ rpcUrl: "ftp://example.com" })).toThrow(ConfigError);
  });
});
