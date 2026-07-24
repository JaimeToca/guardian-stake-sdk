import { describe, it, expect } from "vitest";
import { validateRpcUrl, ConfigError } from "../../src";

describe("validateRpcUrl — default behavior (opt-in guard OFF)", () => {
  it("accepts http://localhost:8545 with no options passed (unchanged behavior)", () => {
    expect(() => validateRpcUrl("http://localhost:8545")).not.toThrow();
  });

  it("accepts a normal public URL with no options passed", () => {
    expect(() => validateRpcUrl("https://bsc-dataseed.bnbchain.org")).not.toThrow();
  });

  it("accepts private/loopback/metadata hosts when the guard is explicitly disabled", () => {
    expect(() =>
      validateRpcUrl("http://127.0.0.1:8545", { rejectPrivateHosts: false })
    ).not.toThrow();
    expect(() =>
      validateRpcUrl("http://169.254.169.254/latest/meta-data", { rejectPrivateHosts: false })
    ).not.toThrow();
  });
});

describe("validateRpcUrl — opt-in private-host guard enabled", () => {
  const opts = { rejectPrivateHosts: true };

  it("rejects the cloud-metadata address", () => {
    expect.assertions(2);
    try {
      validateRpcUrl("http://169.254.169.254/latest/meta-data", opts);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }
  });

  it("rejects localhost by name", () => {
    expect.assertions(2);
    try {
      validateRpcUrl("http://localhost:8545", opts);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }
  });

  it.each([
    "http://127.0.0.1:8545",
    "http://127.5.6.7",
    "http://[::1]:8545",
    "http://[fe80::1]:8545",
    "http://[fe80::abcd:1]:8545",
    "http://[fc00::1]:8545",
    "http://[fd12:3456:789a::1]:8545",
    "http://[::ffff:127.0.0.1]:8545",
    "http://[::ffff:7f00:1]:8545",
    "http://[::ffff:a9fe:a9fe]:8545",
    "http://10.0.0.5",
    "http://172.16.0.1",
    "http://172.31.255.255",
    "http://192.168.1.1",
    "http://169.254.169.254",
    "http://foo.local",
  ])("rejects private/link-local/.local host: %s", (url) => {
    expect.assertions(2);
    try {
      validateRpcUrl(url, opts);
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).code).toBe("INVALID_RPC_URL");
    }
  });

  it("accepts a normal public host", () => {
    expect(() => validateRpcUrl("https://bsc-dataseed.bnbchain.org", opts)).not.toThrow();
    expect(() => validateRpcUrl("https://8.8.8.8", opts)).not.toThrow();
    expect(() => validateRpcUrl("https://[2001:4860:4860::8888]", opts)).not.toThrow();
  });

  it("does not reject a public host that merely contains '172' outside the private ranges", () => {
    expect(() => validateRpcUrl("https://172.32.0.1", opts)).not.toThrow();
    expect(() => validateRpcUrl("https://192.169.1.1", opts)).not.toThrow();
    expect(() => validateRpcUrl("https://11.0.0.1", opts)).not.toThrow();
  });
});
