import { ConfigError } from "./errors";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

/**
 * Validates that a given string is a well-formed URL with an allowed protocol.
 * Throws `ConfigError` with code `INVALID_RPC_URL` if validation fails.
 *
 * Intended to be called by chain factory functions (e.g. `bsc()`) before
 * passing the URL to any transport layer.
 */
export function validateRpcUrl(rpcUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(rpcUrl);
  } catch {
    throw new ConfigError("INVALID_RPC_URL", `Invalid rpcUrl: "${rpcUrl}" is not a valid URL`);
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new ConfigError(
      "INVALID_RPC_URL",
      `Invalid rpcUrl: protocol must be http, https, ws, or wss — got "${parsed.protocol.replace(":", "")}"`
    );
  }
}
