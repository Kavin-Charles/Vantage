import dns from 'dns/promises';
import { isIP } from 'net';

// RFC1918 + loopback + link-local + IANA reserved
const BLOCKED_CIDRS_V4: Array<[number, number, number]> = [
  [0x7f000000, 0xff000000, 8],    // 127.0.0.0/8  loopback
  [0x0a000000, 0xff000000, 8],    // 10.0.0.0/8
  [0xac100000, 0xfff00000, 12],   // 172.16.0.0/12
  [0xc0a80000, 0xffff0000, 16],   // 192.168.0.0/16
  [0xa9fe0000, 0xffff0000, 16],   // 169.254.0.0/16 link-local / IMDS
  [0x00000000, 0xff000000, 8],    // 0.0.0.0/8
  [0xc0000000, 0xffffff00, 24],   // 192.0.0.0/24 IANA special
  [0xc0000200, 0xffffff00, 24],   // 192.0.2.0/24 TEST-NET-1
  [0xc6336400, 0xfffe0000, 15],   // 198.51.100.0/24 TEST-NET-2
  [0xcb007100, 0xffffff00, 24],   // 203.0.113.0/24 TEST-NET-3
  [0xe0000000, 0xe0000000, 4],    // 224.0.0.0/4  multicast
  [0xf0000000, 0xf0000000, 4],    // 240.0.0.0/4  reserved
];

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const val = ipv4ToInt(ip);
  return BLOCKED_CIDRS_V4.some(([net, mask]) => (val & mask) === (net & mask));
}

function isBlockedV6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  // Loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;
  // Unspecified
  if (lower === '::' || lower === '0:0:0:0:0:0:0:0') return true;
  // ULA fc00::/7
  const first16 = parseInt(lower.split(':')[0] ?? '0', 16);
  if ((first16 & 0xfe00) === 0xfc00) return true;
  // Link-local fe80::/10
  if ((first16 & 0xffc0) === 0xfe80) return true;
  // Multicast ff00::/8
  if ((first16 & 0xff00) === 0xff00) return true;
  // IPv4-mapped / IPv4-compatible ::ffff:0:0/96
  if (lower.startsWith('::ffff:')) {
    const v4part = lower.slice(7);
    if (isIP(v4part) === 4) return isBlockedV4(v4part);
  }
  return false;
}

function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedV4(ip);
  if (version === 6) return isBlockedV6(ip);
  return true; // unknown format → block
}

export class SsrfError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'SsrfError';
  }
}

export async function assertSafeUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid URL: ${rawUrl}`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new SsrfError(`Blocked URL scheme "${parsed.protocol}". Only http/https allowed.`);
  }

  const hostname = parsed.hostname;

  // If hostname is already an IP, check directly
  if (isIP(hostname) !== 0) {
    if (isBlockedIp(hostname)) {
      throw new SsrfError(`Blocked request to private/reserved IP: ${hostname}`);
    }
    return;
  }

  // Resolve DNS and check each resolved IP
  let addresses: string[];
  try {
    const results = await dns.resolve(hostname, 'ANY').catch(() => dns.lookup(hostname, { all: true }));
    addresses = Array.isArray(results)
      ? results.map((r: any) => (typeof r === 'string' ? r : r.address))
      : [results as string];
  } catch {
    throw new SsrfError(`Failed to resolve host: ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new SsrfError(`Blocked: "${hostname}" resolves to private/reserved IP ${addr}`);
    }
  }
}
