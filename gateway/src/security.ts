export class RelayHttpError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = 'RelayHttpError';
  }
}

export type RelayTarget = {
  host: string;
  port: number;
  address: string;
  family: 4 | 6;
};

type DnsJson = {
  Status?: number;
  Answer?: Array<{ type?: number; data?: string }>;
};

const encoder = new TextEncoder();

export async function readBoundedJson<T>(request: Request, maxBytes = 4096): Promise<T> {
  const contentLength = request.headers.get('Content-Length');
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > maxBytes)) {
    throw new RelayHttpError('Request too large', 413);
  }
  if (!request.body) throw new RelayHttpError('Invalid JSON body');

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel('request body limit exceeded').catch(() => undefined);
        throw new RelayHttpError('Request too large', 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)) as T;
  } catch {
    throw new RelayHttpError('Invalid JSON body');
  }
}

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function encodeBase64Url(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
}

export function randomToken(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return encodeBase64Url(bytes);
}

export async function sha256Base64Url(value: string): Promise<string> {
  return encodeBase64Url(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

export async function constantTimeTokenEqual(actual: string, expected: string): Promise<boolean> {
  if (!actual || !expected || actual.length > 4096 || expected.length > 4096) return false;
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let difference = actual.length ^ expected.length;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value.trim() === '') return fallback;
  if (!/^\d+$/u.test(value.trim())) throw new RelayHttpError('Invalid numeric gateway setting', 500);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new RelayHttpError('Gateway setting is outside its supported range', 500);
  }
  return parsed;
}

export function parseAllowedPorts(value: string | undefined): (port: number) => boolean {
  const rules = (value || '22')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): [number, number] => {
      const match = /^(\d{1,5})(?:-(\d{1,5}))?$/u.exec(part);
      if (!match) throw new RelayHttpError('ALLOWED_PORTS contains an invalid rule', 500);
      const start = Number(match[1]);
      const end = Number(match[2] || match[1]);
      if (start < 1 || end > 65535 || start > end || (start <= 25 && end >= 25)) {
        throw new RelayHttpError('ALLOWED_PORTS contains a forbidden range', 500);
      }
      return [start, end];
    });
  return (port: number) => rules.some(([start, end]) => port >= start && port <= end);
}

function parseIPv4(value: string): number[] | null {
  const parts = value.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/u.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    bytes.push(byte);
  }
  return bytes;
}

function parseIPv6(value: string): number[] | null {
  if (!value || value.includes('%') || value.split('::').length > 2) return null;
  let source = value.toLowerCase();
  const ipv4Tail = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/u.exec(source);
  if (ipv4Tail) {
    const bytes = parseIPv4(ipv4Tail[1]);
    if (!bytes) return null;
    const replacement = `${((bytes[0] << 8) | bytes[1]).toString(16)}:${((bytes[2] << 8) | bytes[3]).toString(16)}`;
    source = source.slice(0, source.length - ipv4Tail[1].length) + replacement;
  }

  const halves = source.split('::');
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const parseHalf = (part: string): number | null => {
    if (!/^[0-9a-f]{1,4}$/u.test(part)) return null;
    return Number.parseInt(part, 16);
  };
  const leftValues = left.map(parseHalf);
  const rightValues = right.map(parseHalf);
  if (leftValues.some((item) => item === null) || rightValues.some((item) => item === null)) {
    return null;
  }
  if (halves.length === 1) {
    return leftValues.length === 8 ? (leftValues as number[]) : null;
  }
  const missing = 8 - leftValues.length - rightValues.length;
  if (missing < 1) return null;
  return [...(leftValues as number[]), ...Array<number>(missing).fill(0), ...(rightValues as number[])];
}

export function isPublicIPv4(value: string): boolean {
  const bytes = parseIPv4(value);
  if (!bytes) return false;
  const [a, b, c] = bytes;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 0 && c === 0) return false;
  if (a === 192 && b === 0 && c === 2) return false;
  if (a === 192 && b === 88 && c === 99) return false;
  if (a === 192 && b === 168) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  if (a === 198 && b === 51 && c === 100) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function isPublicIPv6(value: string): boolean {
  const groups = parseIPv6(value);
  if (!groups) return false;
  const allZero = groups.every((group) => group === 0);
  if (allZero || (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1)) return false;

  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0 || groups[5] === 0xffff)) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isPublicIPv4(ipv4);
  }

  if ((groups[0] & 0xe000) !== 0x2000) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return false;
  if (groups[0] === 0x2001 && groups[1] >= 0x0010 && groups[1] <= 0x001f) return false;
  if (groups[0] === 0x2001 && groups[1] >= 0x0020 && groups[1] <= 0x002f) return false;
  if (groups[0] === 0x2001 && groups[1] === 0x0002) return false;
  if (groups[0] === 0x2002) return false;
  if (groups[0] >= 0x3ff0 && groups[0] <= 0x3fff) return false;
  return true;
}

function stripIpv6Brackets(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}

export function normalizeHost(input: string): string {
  let value = input.trim();
  if (!value || value.length > 253 || /[\s/@?#]/u.test(value)) {
    throw new RelayHttpError('Invalid target host');
  }
  value = stripIpv6Brackets(value);
  if (parseIPv6(value)) return value.toLowerCase();

  try {
    const parsed = new URL(`http://${value}`);
    if (parsed.username || parsed.password || parsed.port || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error('host contains URL components');
    }
    value = stripIpv6Brackets(parsed.hostname).replace(/\.$/u, '').toLowerCase();
  } catch {
    throw new RelayHttpError('Invalid target host');
  }

  if (parseIPv4(value)) return value;
  if (
    value.length > 253 ||
    value === 'localhost' ||
    value.endsWith('.localhost') ||
    value.endsWith('.local') ||
    value.endsWith('.internal') ||
    value.endsWith('.lan') ||
    !value.includes('.') ||
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(value)
  ) {
    throw new RelayHttpError('Target must be a public IP address or fully qualified domain name');
  }
  return value;
}

export function hostAllowed(host: string, value: string | undefined): boolean {
  const rules = (value || '')
    .split(',')
    .map((rule) => rule.trim().toLowerCase().replace(/\.$/u, ''))
    .filter(Boolean);
  if (rules.length === 0) return true;
  return rules.some((rule) => {
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(1);
      return host.endsWith(suffix) && host.length > suffix.length;
    }
    return host === stripIpv6Brackets(rule);
  });
}

export function originAllowed(origin: string | null, value: string | undefined): boolean {
  if (!origin) return false;
  const rules = (value || '')
    .split(',')
    .map((rule) => rule.trim())
    .filter(Boolean);
  if (rules.includes('*')) return true;
  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }
  return rules.some((rule) => {
    try {
      return new URL(rule).origin === normalized;
    } catch {
      return false;
    }
  });
}

async function queryDns(host: string, type: 'A' | 'AAAA', fetcher: typeof fetch): Promise<DnsJson> {
  const url = new URL('https://cloudflare-dns.com/dns-query');
  url.searchParams.set('name', host);
  url.searchParams.set('type', type);
  const response = await fetcher(url, {
    headers: { Accept: 'application/dns-json' },
    redirect: 'error',
  });
  if (!response.ok) throw new RelayHttpError('DNS validation service failed', 502);
  const body = await response.json<DnsJson>();
  if (body.Status !== 0) throw new RelayHttpError('Target host did not resolve', 422);
  return body;
}

export async function resolvePublicTarget(
  rawHost: string,
  rawPort: unknown,
  options: {
    allowedPorts?: string;
    allowedHosts?: string;
    fetcher?: typeof fetch;
  } = {},
): Promise<RelayTarget> {
  const host = normalizeHost(rawHost);
  const port = typeof rawPort === 'number' ? rawPort : Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535 || port === 25) {
    throw new RelayHttpError('Invalid or forbidden target port');
  }
  if (!parseAllowedPorts(options.allowedPorts)(port)) {
    throw new RelayHttpError('Target port is not allowlisted', 403);
  }
  if (!hostAllowed(host, options.allowedHosts)) {
    throw new RelayHttpError('Target host is not allowlisted', 403);
  }

  if (parseIPv4(host)) {
    if (!isPublicIPv4(host)) throw new RelayHttpError('Private and reserved targets are blocked', 403);
    return { host, port, address: host, family: 4 };
  }
  if (parseIPv6(host)) {
    if (!isPublicIPv6(host)) throw new RelayHttpError('Private and reserved targets are blocked', 403);
    return { host, port, address: host, family: 6 };
  }

  const fetcher = options.fetcher || fetch;
  let responses: DnsJson[];
  try {
    responses = await Promise.all([queryDns(host, 'A', fetcher), queryDns(host, 'AAAA', fetcher)]);
  } catch (error) {
    if (error instanceof RelayHttpError) throw error;
    throw new RelayHttpError('DNS validation failed closed', 502);
  }

  const addresses = new Map<string, 4 | 6>();
  for (const response of responses) {
    for (const answer of response.Answer || []) {
      const data = answer.data?.trim();
      if (!data) continue;
      if (answer.type === 1 && parseIPv4(data)) addresses.set(data, 4);
      if (answer.type === 28 && parseIPv6(data)) addresses.set(data.toLowerCase(), 6);
    }
  }
  if (addresses.size === 0) throw new RelayHttpError('Target host has no A or AAAA address', 422);
  for (const [address, family] of addresses) {
    const isPublic = family === 4 ? isPublicIPv4(address) : isPublicIPv6(address);
    if (!isPublic) {
      throw new RelayHttpError('DNS returned a private or reserved address', 403);
    }
  }

  const preferred = [...addresses].sort((left, right) => left[1] - right[1])[0];
  return { host, port, address: preferred[0], family: preferred[1] };
}

export function parseTicketProtocol(header: string | null): string | null {
  const protocols = (header || '').split(',').map((value) => value.trim());
  if (!protocols.includes('ohmyssh.v1')) return null;
  const encoded = protocols.find((value) => value.startsWith('ticket.'))?.slice('ticket.'.length);
  if (!encoded || !/^[A-Za-z0-9_-]{40,128}$/u.test(encoded)) return null;
  try {
    if (decodeBase64Url(encoded).length < 24) return null;
  } catch {
    return null;
  }
  return encoded;
}
