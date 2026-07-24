import { ConfigError } from "./errors";

const ALLOWED_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

/**
 * Options controlling `validateRpcUrl`'s optional private-host guard.
 */
export interface ValidateRpcUrlOptions {
  /**
   * When `true`, rejects `rpcUrl`s that resolve (by literal hostname, not DNS)
   * to loopback, private, link-local, or `.local`/`localhost` hosts — e.g.
   * `127.0.0.0/8`, `::1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
   * `169.254.0.0/16` (including the `169.254.169.254` cloud-metadata address),
   * and any `*.local` or `localhost` hostname.
   *
   * Defaults to `false` (off) so existing consumers pointing `rpcUrl` at a
   * local/private/dev node (e.g. a local devnet, private validator, or
   * internal test RPC) are not broken. Opt in only when `rpcUrl` might
   * originate from a less-trusted source and you want defense-in-depth
   * against SSRF.
   */
  rejectPrivateHosts?: boolean;
}

/**
 * Validates that a given string is a well-formed URL with an allowed protocol.
 * Throws `ConfigError` with code `INVALID_RPC_URL` if validation fails.
 *
 * Intended to be called by chain factory functions (e.g. `bsc()`) before
 * passing the URL to any transport layer.
 *
 * **Trust model**: `rpcUrl` must always be operator-trusted configuration —
 * never accept it directly from untrusted end-user input. By default this
 * function only checks protocol; pass `{ rejectPrivateHosts: true }` to also
 * reject loopback/private/link-local/metadata hosts (opt-in, default off —
 * see `ValidateRpcUrlOptions`).
 */
export function validateRpcUrl(rpcUrl: string, options?: ValidateRpcUrlOptions): void {
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

  if (options?.rejectPrivateHosts && isPrivateOrLocalHost(parsed.hostname)) {
    throw new ConfigError(
      "INVALID_RPC_URL",
      `Invalid rpcUrl: "${rpcUrl}" resolves to a loopback/private/link-local host, which is rejected when rejectPrivateHosts is enabled`
    );
  }
}

/**
 * Literal (non-DNS-resolving) check of whether a hostname is loopback,
 * private, link-local, or a `.local`/`localhost` name. Operates only on the
 * hostname string as parsed by `URL` — it does not perform DNS resolution,
 * so it cannot catch a public hostname that *resolves* to a private IP
 * (DNS rebinding). It defends against the literal-address case only.
 */
function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }

  const bracketless = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (bracketless === "::1") {
    return true;
  }

  // Native IPv6 unique-local (fc00::/7 → fc00::/8 and fd00::/8) and link-local (fe80::/10).
  if (isIpv6UniqueLocalOrLinkLocal(bracketless)) {
    return true;
  }

  // IPv4-mapped IPv6: dotted form (::ffff:127.0.0.1) or hex form (::ffff:7f00:1).
  const ipv4Mapped = parseIpv4MappedIpv6(bracketless);
  const ipv4Candidate = ipv4Mapped ?? bracketless;

  const octets = parseIpv4(ipv4Candidate);
  if (!octets) {
    return false;
  }

  const [a, b] = octets;

  if (a === 127) return true; // 127.0.0.0/8 (loopback)
  if (a === 10) return true; // 10.0.0.0/8 (private)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 (private)
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 (private)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, incl. cloud metadata)
  if (a === 0) return true; // 0.0.0.0/8 ("this network" / unspecified)

  return false;
}

/**
 * True for literal IPv6 unique-local (`fc00::/7`) or link-local (`fe80::/10`) hostnames.
 * Only inspects the leading hextet(s); does not fully parse IPv6.
 */
function isIpv6UniqueLocalOrLinkLocal(host: string): boolean {
  // Must look like IPv6 (contains ':') and not be an IPv4-mapped form we handle elsewhere.
  if (!host.includes(":")) {
    return false;
  }

  // Unique local: fc00::/7 → first hextet in [fc00, fdff]
  // Link-local: fe80::/10 → first hextet in [fe80, febf]
  const firstHextetMatch = /^([0-9a-f]{1,4}):/i.exec(host);
  if (!firstHextetMatch) {
    return false;
  }
  const first = Number.parseInt(firstHextetMatch[1], 16);
  if (Number.isNaN(first)) {
    return false;
  }
  if (first >= 0xfc00 && first <= 0xfdff) return true; // fc00::/7
  if (first >= 0xfe80 && first <= 0xfebf) return true; // fe80::/10
  return false;
}

/**
 * Parses IPv4-mapped IPv6 literals (`::ffff:…`) into a dotted-quad string for `parseIpv4`.
 * Accepts both `::ffff:127.0.0.1` and hexadecimal `::ffff:7f00:1` / `::ffff:a9fe:a9fe`.
 */
function parseIpv4MappedIpv6(host: string): string | undefined {
  const dotted = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(host);
  if (dotted) {
    return dotted[1];
  }

  // Hex form: ::ffff:HHHH:HHHH → four IPv4 octets from the two 16-bit hextets.
  const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
  if (!hex) {
    return undefined;
  }
  const hi = Number.parseInt(hex[1], 16);
  const lo = Number.parseInt(hex[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo) || hi > 0xffff || lo > 0xffff) {
    return undefined;
  }
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

/**
 * Parses a strict dotted-quad IPv4 address. Returns `undefined` for anything
 * that isn't exactly four 0-255 octets (including hostnames).
 */
function parseIpv4(value: string): [number, number, number, number] | undefined {
  const parts = value.split(".");
  if (parts.length !== 4) {
    return undefined;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return undefined;
    }
    const n = Number(part);
    if (n > 255) {
      return undefined;
    }
    octets.push(n);
  }

  return octets as [number, number, number, number];
}
