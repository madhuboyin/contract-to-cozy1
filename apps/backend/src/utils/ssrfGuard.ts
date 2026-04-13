/**
 * SSRF (Server-Side Request Forgery) guard utility.
 *
 * Call `assertSafeUrl(url)` before every `fetch()` whose URL originates from
 * user input, external data, or environment configuration that could be
 * manipulated by an attacker. It throws if the URL targets a private,
 * loopback, link-local, or otherwise reserved address.
 *
 * Checks performed:
 *  1. Scheme must be http or https.
 *  2. Hostname must not be a bare IP in a blocked range.
 *  3. DNS resolution must not yield an IP in a blocked range
 *     (guards against DNS rebinding).
 */

import dns, { LookupAddress } from 'dns';

// ---------------------------------------------------------------------------
// IPv4 CIDR helpers
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip
    .split('.')
    .reduce((acc, octet) => ((acc << 8) + parseInt(octet, 10)) >>> 0, 0);
}

function inCidr(ip: string, cidr: string): boolean {
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

// Ranges that must never be the target of a server-side HTTP request.
// Includes loopback, RFC-1918 private, link-local (AWS/GCP/Azure IMDS at
// 169.254.169.254), shared address space, and all other reserved blocks.
const BLOCKED_IPV4_CIDRS = [
  '0.0.0.0/8',        // "This" network
  '10.0.0.0/8',       // RFC-1918 private
  '100.64.0.0/10',    // Shared address space (RFC 6598)
  '127.0.0.0/8',      // Loopback
  '169.254.0.0/16',   // Link-local — AWS IMDS, GCP IMDS, Azure IMDS all live here
  '172.16.0.0/12',    // RFC-1918 private
  '192.0.0.0/24',     // IETF Protocol Assignments
  '192.0.2.0/24',     // TEST-NET-1 (documentation)
  '192.168.0.0/16',   // RFC-1918 private
  '198.18.0.0/15',    // Benchmarking (RFC 2544)
  '198.51.100.0/24',  // TEST-NET-2 (documentation)
  '203.0.113.0/24',   // TEST-NET-3 (documentation)
  '240.0.0.0/4',      // Reserved (Class E)
  '255.255.255.255/32', // Broadcast
];

function isBlockedIPv4(ip: string): boolean {
  return BLOCKED_IPV4_CIDRS.some((cidr) => inCidr(ip, cidr));
}

// ---------------------------------------------------------------------------
// IPv6 blocked addresses
// ---------------------------------------------------------------------------

// Rather than a full CIDR parser for IPv6, we block the most critical
// categories by prefix string matching on the normalised address.
const BLOCKED_IPV6_PREFIXES = [
  '::1',         // Loopback
  '::ffff:',     // IPv4-mapped — e.g. ::ffff:127.0.0.1
  'fc',          // Unique local (fc00::/7)
  'fd',          // Unique local (fd00::/7)
  'fe80',        // Link-local (fe80::/10)
  '64:ff9b',     // IPv4/IPv6 translation (RFC 6146)
];

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[|\]$/g, '');
  return BLOCKED_IPV6_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

// ---------------------------------------------------------------------------
// Blocked hostnames
// ---------------------------------------------------------------------------

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal', // GCP metadata endpoint (also 169.254.169.254)
]);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export class SSRFError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SSRFError';
  }
}

/**
 * Asserts that `rawUrl` is safe to use as the target of a server-side HTTP
 * request. Throws `SSRFError` if any check fails.
 *
 * @param rawUrl - The URL to validate (must be absolute).
 */
export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SSRFError(`Invalid URL: ${rawUrl}`);
  }

  // 1. Scheme check — only allow plain HTTP and HTTPS
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new SSRFError(
      `Blocked URL scheme "${parsed.protocol}" — only http and https are allowed`
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Blocked hostname list (e.g. "localhost")
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new SSRFError(`Blocked hostname: ${hostname}`);
  }

  // 3. If the hostname is already a bare IPv4 address, check it immediately
  //    without a DNS round-trip.
  const ipv4Re = /^\d{1,3}(\.\d{1,3}){3}$/;
  if (ipv4Re.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      throw new SSRFError(`Blocked IP address: ${hostname}`);
    }
    return; // No DNS lookup needed for a literal IP
  }

  // 4. If the hostname looks like an IPv6 literal (brackets stripped by URL
  //    parser), check it immediately.
  if (hostname.includes(':')) {
    if (isBlockedIPv6(hostname)) {
      throw new SSRFError(`Blocked IPv6 address: ${hostname}`);
    }
    return;
  }

  // 5. DNS resolution check — resolves to all addresses and validates each.
  //    This guards against DNS rebinding attacks where a benign name resolves
  //    to a private IP.
  let addresses: LookupAddress[];
  try {
    addresses = await dns.promises.lookup(hostname, { all: true });
  } catch {
    throw new SSRFError(`DNS resolution failed for hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new SSRFError(`DNS resolution returned no addresses for: ${hostname}`);
  }

  for (const { address, family } of addresses) {
    if (family === 4 && isBlockedIPv4(address)) {
      throw new SSRFError(
        `Hostname "${hostname}" resolves to blocked IPv4 address: ${address}`
      );
    }
    if (family === 6 && isBlockedIPv6(address)) {
      throw new SSRFError(
        `Hostname "${hostname}" resolves to blocked IPv6 address: ${address}`
      );
    }
  }
}
