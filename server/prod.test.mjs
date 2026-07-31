import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticServer } from './prod.mjs';

let distDir;
let server;
let port;

function request(pathname, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: options.method || 'GET',
      headers: options.headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: res.headers,
        status: res.statusCode,
      }));
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function websocketUpgrade(pathname) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    let response = '';
    socket.setEncoding('utf8');
    socket.setTimeout(3000, () => socket.destroy(new Error('upgrade response timed out')));
    socket.on('connect', () => {
      socket.write([
        `GET ${pathname} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        '',
        '',
      ].join('\r\n'));
    });
    socket.on('data', (chunk) => { response += chunk; });
    socket.on('end', () => resolve(response));
    socket.on('error', reject);
  });
}

beforeAll(async () => {
  distDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'oh-myssh-static-'));
  await fs.promises.mkdir(path.join(distDir, 'assets'));
  await fs.promises.writeFile(path.join(distDir, 'index.html'), '<!doctype html><title>Oh My SSH</title>');
  await fs.promises.writeFile(path.join(distDir, 'assets', 'app.js'), 'export {};');
  server = createStaticServer({ distDir });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  port = server.address().port;
});

afterAll(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (distDir) await fs.promises.rm(distDir, { recursive: true, force: true });
});

describe('production static server security boundary', () => {
  it('serves static assets and extensionless SPA routes', async () => {
    const index = await request('/');
    expect(index.status).toBe(200);
    expect(index.body).toContain('Oh My SSH');

    const asset = await request('/assets/app.js');
    expect(asset.status).toBe(200);
    expect(asset.headers['content-type']).toContain('text/javascript');

    const route = await request('/connections/new');
    expect(route.status).toBe(200);
    expect(route.body).toContain('Oh My SSH');

    expect((await request('/assets/missing.js')).status).toBe(404);
  });

  it('publishes a static-only health contract and refuses request bodies', async () => {
    const health = await request('/health');
    expect(health.status).toBe(200);
    expect(JSON.parse(health.body)).toEqual({
      ok: true,
      service: 'oh-myssh',
      mode: 'static-only',
      sshGateway: false,
    });

    const connect = await request('/ssh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ host: '127.0.0.1', username: 'root', password: 'secret' }),
    });
    expect(connect.status).toBe(405);
  });

  it('rejects the former SSH WebSocket upgrade paths', async () => {
    for (const pathname of ['/ssh', '/ssh-ws']) {
      const response = await websocketUpgrade(pathname);
      expect(response).toContain('HTTP/1.1 426 Upgrade Required');
      expect(response).toContain('WebSocket gateways are not served by this process');
    }
  });

  it('sets security headers while allowing HTTPS and WSS relay connections', async () => {
    const response = await request('/');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['content-security-policy']).toContain("connect-src 'self' https: wss:");
    expect(response.headers['content-security-policy']).not.toContain("'unsafe-eval'");
  });

  it('does not allow encoded traversal outside dist', async () => {
    const response = await request('/..%2fpackage.json');
    expect(response.status).toBe(403);
    expect(response.body).not.toContain('oh_myssh');
  });
});
