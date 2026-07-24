import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildRelayUrl, buildLocalRelayUrl } from '../browser-stream';

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
    const url = buildLocalRelayUrl('de.w0x7ce.eu', 22);
    expect(url).toContain('ws://localhost:3000/__ohmyssh_tcp');
    expect(url).toContain('host=de.w0x7ce.eu');
    expect(url).toContain('port=22');
  });

  it('appends host/port to custom relay base', () => {
    const url = buildRelayUrl('wss://relay.example/ssh', '10.0.0.1', 2222);
    expect(url).toContain('host=10.0.0.1');
    expect(url).toContain('port=2222');
  });
});
