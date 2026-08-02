import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildLocalRelayUrl, openTicketedRelaySshStream, relayEndpointUrls } from '../browser-stream';
import { PRODUCTION_RELAY_URL, relayUrlForStaticMirror } from '../client';

describe('SSH relay URL builders', () => {
  it('falls back from the Vercel mirror to the unified Worker endpoint', () => {
    expect(relayUrlForStaticMirror('oh-myssh.vercel.app')).toBe(PRODUCTION_RELAY_URL);
    expect(relayUrlForStaticMirror('preview-oh-myssh.vercel.app')).toBe('');
    expect(relayUrlForStaticMirror('ssh.w0x7ce.eu')).toBe('');
  });

  const original = globalThis.window;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: {
        location: {
          protocol: 'http:',
          host: 'localhost:3000',
          href: 'http://localhost:3000/',
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: original,
    });
  });

  it('builds local vite relay URL', () => {
    const url = buildLocalRelayUrl('ssh.example.com', 22);
    expect(url).toContain('ws://localhost:3000/__ohmyssh_tcp');
    expect(url).toContain('host=ssh.example.com');
    expect(url).toContain('port=22');
  });

  it('builds ticket and websocket endpoints without target data in the URL', () => {
    expect(relayEndpointUrls('https://relay.example/base/')).toEqual({
      ticketUrl: 'https://relay.example/base/api/ticket',
      webSocketUrl: 'wss://relay.example/base/api/tcp',
    });
  });

  it('rejects credentials, query strings, and insecure remote relays', () => {
    expect(() => relayEndpointUrls('https://token@relay.example')).toThrow(/credentials/u);
    expect(() => relayEndpointUrls('https://relay.example?token=secret')).toThrow(/query/u);
    expect(() => relayEndpointUrls('http://relay.example')).toThrow(/HTTPS/u);
    expect(relayEndpointUrls('http://localhost:8787').ticketUrl).toBe(
      'http://localhost:8787/api/ticket',
    );
  });

  it('uses the browser login cookie without requiring a relay bearer token', async () => {
    const sessionId = 'a'.repeat(64);
    const ticket = 'A'.repeat(43);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.credentials).toBe('include');
      expect(new Headers(init?.headers).has('Authorization')).toBe(false);
      return Response.json({
        protocol: 'ohmyssh.v1',
        sessionId,
        ticket,
        expiresAt: Date.now() + 30_000,
      }, { status: 201 });
    });
    const protocolLog: string[][] = [];
    class FakeWebSocket {
      static readonly OPEN = 1;
      static readonly CLOSED = 3;
      readonly OPEN = 1;
      readyState = FakeWebSocket.OPEN;
      bufferedAmount = 0;
      binaryType = 'arraybuffer';
      onopen: (() => void) | null = null;
      onmessage: ((event: MessageEvent) => void) | null = null;
      onclose: ((event: CloseEvent) => void) | null = null;
      onerror: (() => void) | null = null;

      constructor(_url: string | URL, protocols: string[]) {
        protocolLog.push(protocols);
        queueMicrotask(() => {
          this.onopen?.();
          this.onmessage?.({ data: JSON.stringify({ type: 'ready' }) } as MessageEvent);
        });
      }

      addEventListener(): void {}
      send(): void {}
      close(): void {
        this.readyState = FakeWebSocket.CLOSED;
        this.onclose?.({ wasClean: true, code: 1000, reason: '' } as CloseEvent);
      }
    }

    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const stream = await openTicketedRelaySshStream(
      { url: 'https://ssh.w0x7ce.eu', accessToken: '' },
      'example.com',
      22,
      1_000,
    );
    expect(protocolLog).toEqual([['ohmyssh.v1', `ticket.${ticket}`]]);
    await stream.close();
    vi.unstubAllGlobals();
  });
});
