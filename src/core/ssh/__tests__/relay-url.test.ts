import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildLocalRelayUrl, relayEndpointUrls } from '../browser-stream';

describe('SSH relay URL builders', () => {
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
});
