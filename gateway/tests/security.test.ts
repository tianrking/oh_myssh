import { describe, expect, it, vi } from 'vitest';
import {
  constantTimeTokenEqual,
  hostAllowed,
  isPublicIPv4,
  isPublicIPv6,
  normalizeHost,
  originAllowed,
  parseAllowedPorts,
  parseTicketProtocol,
  readBoundedJson,
  randomToken,
  RelayHttpError,
  resolvePublicTarget,
} from '../src/security';

describe('gateway target policy', () => {
  it.each([
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.1.1',
    '172.16.0.1',
    '192.168.1.1',
    '192.0.2.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
  ])('blocks non-public IPv4 %s', (address) => {
    expect(isPublicIPv4(address)).toBe(false);
  });

  it('accepts an ordinary public IPv4 address', () => {
    expect(isPublicIPv4('8.8.8.8')).toBe(true);
  });

  it.each(['::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:c0a8:101::']) (
    'blocks non-public IPv6 %s',
    (address) => expect(isPublicIPv6(address)).toBe(false),
  );

  it('accepts a globally routable IPv6 address', () => {
    expect(isPublicIPv6('2606:4700:4700::1111')).toBe(true);
  });

  it('normalizes domains and URL-style integer IP addresses', () => {
    expect(normalizeHost('Example.COM.')).toBe('example.com');
    expect(normalizeHost('2130706433')).toBe('127.0.0.1');
  });

  it('rejects local names and URL components', () => {
    expect(() => normalizeHost('localhost')).toThrow(RelayHttpError);
    expect(() => normalizeHost('ssh.example.com/path')).toThrow(RelayHttpError);
  });

  it('enforces exact and wildcard host allowlists', () => {
    expect(hostAllowed('ssh.example.com', '*.example.com')).toBe(true);
    expect(hostAllowed('example.com', '*.example.com')).toBe(false);
    expect(hostAllowed('ssh.example.net', 'ssh.example.com')).toBe(false);
  });

  it('enforces port rules without allowing SMTP port 25', () => {
    const allowed = parseAllowedPorts('22,2222,22000-22010');
    expect(allowed(22)).toBe(true);
    expect(allowed(22005)).toBe(true);
    expect(allowed(80)).toBe(false);
    expect(() => parseAllowedPorts('20-30')).toThrow(RelayHttpError);
  });
});

describe('DNS pinning', () => {
  it('pins a validated public A address', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const type = new URL(String(input)).searchParams.get('type');
      return Response.json(
        type === 'A'
          ? { Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }] }
          : { Status: 0, Answer: [] },
      );
    }) as typeof fetch;
    await expect(resolvePublicTarget('ssh.example.com', 22, { fetcher })).resolves.toMatchObject({
      host: 'ssh.example.com',
      address: '8.8.8.8',
      family: 4,
      port: 22,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).hostname)).toEqual([
      'dns.google',
      'dns.google',
    ]);
    expect(fetcher.mock.calls.every(([, init]) => init?.redirect === 'manual')).toBe(true);
  });

  it('fails closed if any DNS answer is private', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const type = new URL(String(input)).searchParams.get('type');
      return Response.json(
        type === 'A'
          ? { Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }, { type: 1, data: '10.0.0.2' }] }
          : { Status: 0, Answer: [] },
      );
    }) as typeof fetch;
    await expect(resolvePublicTarget('ssh.example.com', 22, { fetcher })).rejects.toMatchObject({ status: 403 });
  });

  it('fails closed when the resolver is unavailable', async () => {
    const fetcher = vi.fn(async () => {
      throw new Error('offline');
    }) as typeof fetch;
    await expect(resolvePublicTarget('ssh.example.com', 22, { fetcher })).rejects.toMatchObject({ status: 502 });
  });
});

describe('gateway request authentication helpers', () => {
  it('bounds streamed JSON bodies even when Content-Length is missing', async () => {
    const request = new Request('https://relay.example/api/ticket', {
      method: 'POST',
      body: JSON.stringify({ host: 'ssh.example.com', padding: 'x'.repeat(5000) }),
    });
    request.headers.delete('Content-Length');
    await expect(readBoundedJson(request, 4096)).rejects.toMatchObject({ status: 413 });
  });

  it('requires an exact allowed browser origin', () => {
    const allowed = 'https://oh-myssh.vercel.app,http://localhost:3000';
    expect(originAllowed('https://oh-myssh.vercel.app', allowed)).toBe(true);
    expect(originAllowed('https://oh-myssh.vercel.app.attacker.test', allowed)).toBe(false);
    expect(originAllowed(null, allowed)).toBe(false);
  });

  it('compares access tokens and parses a ticket from WebSocket subprotocols', async () => {
    expect(await constantTimeTokenEqual('correct', 'correct')).toBe(true);
    expect(await constantTimeTokenEqual('wrong', 'correct')).toBe(false);
    const ticket = randomToken(32);
    expect(parseTicketProtocol(`ohmyssh.v1, ticket.${ticket}`)).toBe(ticket);
    expect(parseTicketProtocol(`ticket.${ticket}`)).toBeNull();
  });
});
