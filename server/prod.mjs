/**
 * Production static server for the built Oh My SSH UI.
 *
 * This process deliberately has no SSH, TCP relay, or WebSocket gateway. Real
 * SSH transport is provided by the separately deployed Cloudflare raw relay.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(MODULE_PATH), '..');
const DEFAULT_DIST = path.join(ROOT, 'dist');

const MIME = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
});

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "connect-src 'self' https: wss:",
  "font-src 'self' data:",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
].join('; ');

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Permitted-Cross-Domain-Policies': 'none',
});

function responseHeaders(extra = {}) {
  return { ...SECURITY_HEADERS, ...extra };
}

function send(req, res, status, headers, body = '') {
  const payload = typeof body === 'string' ? Buffer.from(body) : body;
  res.writeHead(status, responseHeaders({
    'Content-Length': String(payload.byteLength),
    ...headers,
  }));
  res.end(req.method === 'HEAD' ? undefined : payload);
}

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

async function regularFile(filename) {
  try {
    const stat = await fs.promises.stat(filename);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function sendFile(req, res, filename, cacheControl) {
  const data = await fs.promises.readFile(filename);
  const contentType = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
  send(req, res, 200, {
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
  }, data);
}

export async function serveStatic(req, res, distDir = DEFAULT_DIST) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(req, res, 405, {
      Allow: 'GET, HEAD',
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    }, 'Method not allowed');
    return;
  }

  let url;
  let pathname;
  try {
    url = new URL(req.url || '/', 'http://static.invalid');
    pathname = decodeURIComponent(url.pathname);
  } catch {
    send(req, res, 400, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    }, 'Bad request');
    return;
  }

  if (pathname === '/health') {
    send(req, res, 200, {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    }, JSON.stringify({ ok: true, service: 'oh-myssh', mode: 'static-only', sshGateway: false }));
    return;
  }

  if (pathname.includes('\0')) {
    send(req, res, 400, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    }, 'Bad request');
    return;
  }

  const root = path.resolve(distDir);
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filename = path.resolve(root, `.${requestedPath}`);
  if (!isInside(root, filename)) {
    send(req, res, 403, {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    }, 'Forbidden');
    return;
  }

  if (await regularFile(filename)) {
    const cacheControl = path.basename(filename) === 'index.html'
      ? 'no-cache'
      : 'public, max-age=3600';
    await sendFile(req, res, filename, cacheControl);
    return;
  }

  // Only extensionless routes receive the SPA shell. Missing assets must stay
  // 404 so a deployment error cannot be hidden behind an HTML response.
  if (!path.extname(requestedPath)) {
    const indexPath = path.join(root, 'index.html');
    if (await regularFile(indexPath)) {
      await sendFile(req, res, indexPath, 'no-cache');
      return;
    }
  }

  send(req, res, 404, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  }, 'Not found');
}

function rejectUpgrade(_req, socket) {
  const body = 'WebSocket gateways are not served by this process. Use the configured Cloudflare relay.\n';
  const response = [
    'HTTP/1.1 426 Upgrade Required',
    'Connection: close',
    'Content-Type: text/plain; charset=utf-8',
    'Cache-Control: no-store',
    'X-Content-Type-Options: nosniff',
    `Content-Length: ${Buffer.byteLength(body)}`,
    '',
    body,
  ].join('\r\n');
  socket.end(response);
}

export function createStaticServer({ distDir = DEFAULT_DIST } = {}) {
  const server = http.createServer((req, res) => {
    void serveStatic(req, res, distDir).catch(() => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      send(req, res, 500, {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      }, 'Internal server error');
    });
  });
  server.on('upgrade', rejectUpgrade);
  return server;
}

function isMainModule() {
  return Boolean(process.argv[1]) && path.resolve(process.argv[1]) === path.resolve(MODULE_PATH);
}

if (isMainModule()) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  if (!fs.existsSync(DEFAULT_DIST)) {
    console.warn('[oh-myssh] dist/ missing - run `npm run build` before `npm start`');
  }
  createStaticServer().listen(port, host, () => {
    console.log(`[oh-myssh] static UI listening on http://${host}:${port}`);
    console.log('[oh-myssh] SSH transport uses the configured Cloudflare raw relay; no local gateway is exposed.');
  });
}
