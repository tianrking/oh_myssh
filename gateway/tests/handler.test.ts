import { describe, expect, it, vi } from 'vitest';

vi.mock('cloudflare:sockets', () => ({ connect: vi.fn() }));

import worker, { clientRateLimitKey } from '../src/index';

function testEnv(assetsFetch: ReturnType<typeof vi.fn>) {
  return {
    ASSETS: { fetch: assetsFetch },
  } as any;
}

describe('unified Worker request boundary', () => {
  it('serves the SPA for a normal browser navigation without Origin', async () => {
    const assetsFetch = vi.fn(async (request: Request) =>
      new Response(`asset:${new URL(request.url).pathname}`, { status: 200 }),
    );

    const response = await worker.fetch(
      new Request('https://oh-myssh.example/'),
      testEnv(assetsFetch),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('asset:/');
    expect(assetsFetch).toHaveBeenCalledTimes(1);
  });

  it('reports the unified deployment in health checks', async () => {
    const response = await worker.fetch(
      new Request('https://oh-myssh.example/health'),
      testEnv(vi.fn()),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: 'oh-myssh-relay',
      deployment: 'unified-workers',
    });
  });

  it('keeps API requests behind the browser Origin boundary', async () => {
    const assetsFetch = vi.fn();
    const response = await worker.fetch(
      new Request('https://oh-myssh.example/api/ticket', { method: 'POST' }),
      testEnv(assetsFetch),
    );

    expect(response.status).toBe(403);
    expect(assetsFetch).not.toHaveBeenCalled();
  });

  it('allows same-origin preflight for the unified Worker', async () => {
    const response = await worker.fetch(
      new Request('https://oh-myssh.example/api/ticket', {
        method: 'OPTIONS',
        headers: { Origin: 'https://oh-myssh.example' },
      }),
      testEnv(vi.fn()),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://oh-myssh.example');
  });

  it('uses a deterministic anonymous rate-limit key when the edge omits the client IP', async () => {
    const first = new Request('https://ssh.w0x7ce.eu/api/ticket', {
      headers: {
        Origin: 'https://ssh.w0x7ce.eu',
        'User-Agent': 'test-browser/1.0',
        'Accept-Language': 'zh-CN',
        'X-Forwarded-For': '198.51.100.20',
      },
    });
    const second = new Request('https://ssh.w0x7ce.eu/api/ticket', {
      headers: {
        Origin: 'https://ssh.w0x7ce.eu',
        'User-Agent': 'test-browser/1.0',
        'Accept-Language': 'zh-CN',
        'X-Forwarded-For': '203.0.113.40',
      },
    });

    const [firstKey, secondKey] = await Promise.all([
      clientRateLimitKey(first),
      clientRateLimitKey(second),
    ]);
    expect(firstKey).toMatch(/^anon:[A-Za-z0-9_-]{43}$/u);
    expect(secondKey).toBe(firstKey);
  });
});
