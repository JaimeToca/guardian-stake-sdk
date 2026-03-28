import { describe, it, expect } from "vitest";
import { validateRpcUrl, ConfigError, ConfigErrorCode } from "@guardian/sdk";

describe("validateRpcUrl", () => {
  it.each(["http://example.com", "https://example.com", "ws://example.com", "wss://example.com"])(
    "accepts %s",
    (url) => {
      expect(() => validateRpcUrl(url)).not.toThrow();
    }
  );

  it.each(["not-a-url", "", "://missing-protocol.com"])(
    "throws INVALID_RPC_URL for malformed url: %s",
    (url) => {
      expect.assertions(2);
      try {
        validateRpcUrl(url);
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).code).toBe(ConfigErrorCode.INVALID_RPC_URL);
      }
    }
  );

  it.each(["ftp://example.com", "file:///etc/passwd", "mailto:user@example.com"])(
    "throws INVALID_RPC_URL for unsupported protocol: %s",
    (url) => {
      expect.assertions(2);
      try {
        validateRpcUrl(url);
      } catch (err) {
        expect(err).toBeInstanceOf(ConfigError);
        expect((err as ConfigError).code).toBe(ConfigErrorCode.INVALID_RPC_URL);
      }
    }
  );
});
