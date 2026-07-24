/**
 * Production all-in-one server:
 *   - Serves the built web UI (dist/)
 *   - WebSSH gateway WebSocket at /ssh and /ssh-ws
 *
 * End users only open the website URL — no download, no npm, no local agent.
 *
 *   npm run build && npm start
 *   # or: docker run ...
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || process.env.OMS_GATEWAY_PORT || 8080);
const HOST = process.env.OMS_GATEWAY_HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function attachSshSession(ws) {
  let ssh = null;
  let shell = null;
  let connected = false;

  const cleanup = () => {
    try {
      shell?.close();
    } catch {
      /* ignore */
    }
    try {
      ssh?.end();
    } catch {
      /* ignore */
    }
    shell = null;
    ssh = null;
    connected = false;
  };

  ws.on('message', (data, isBinary) => {
    if (connected && shell) {
      if (isBinary) {
        shell.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      const text = data.toString();
      try {
        const msg = JSON.parse(text);
        if (msg.type === 'resize') {
          try {
            shell.setWindow(Number(msg.rows) || 24, Number(msg.cols) || 80, 0, 0);
          } catch {
            /* ignore */
          }
          return;
        }
        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong', t: Date.now() });
          return;
        }
      } catch {
        /* plain text */
      }
      shell.write(text);
      return;
    }

    if (isBinary) {
      sendJson(ws, { type: 'error', message: 'Expected JSON connect first' });
      return;
    }

    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      sendJson(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }

    if (msg.type !== 'connect') {
      sendJson(ws, { type: 'error', message: 'First message must be type=connect' });
      return;
    }

    const host = String(msg.host || '').trim();
    const port = Number(msg.port) || 22;
    const username = String(msg.username || '').trim();
    const password = msg.password ? String(msg.password) : undefined;
    const privateKey = msg.privateKey ? String(msg.privateKey) : undefined;
    const cols = Number(msg.cols) || 120;
    const rows = Number(msg.rows) || 40;

    if (!host || !username) {
      sendJson(ws, { type: 'error', message: 'host and username required' });
      return;
    }
    if (!password && !privateKey) {
      sendJson(ws, { type: 'error', message: 'password or privateKey required' });
      return;
    }

    sendJson(ws, {
      type: 'status',
      status: 'connecting',
      target: `${username}@${host}:${port}`,
    });

    ssh = new Client();
    ssh.on('ready', () => {
      ssh.shell({ term: 'xterm-256color', cols, rows }, (err, stream) => {
        if (err) {
          sendJson(ws, { type: 'error', message: `shell failed: ${err.message}` });
          cleanup();
          ws.close();
          return;
        }
        shell = stream;
        connected = true;
        sendJson(ws, {
          type: 'ready',
          target: `${username}@${host}:${port}`,
          mode: 'webssh-gateway',
        });
        stream.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
        });
        stream.stderr?.on('data', (chunk) => {
          if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
        });
        stream.on('close', () => {
          sendJson(ws, { type: 'closed', reason: 'remote shell closed' });
          cleanup();
          try {
            ws.close();
          } catch {
            /* ignore */
          }
        });
      });
    });

    ssh.on('error', (err) => {
      sendJson(ws, { type: 'error', message: err?.message || String(err) });
      cleanup();
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });

    const cfg = {
      host,
      port,
      username,
      readyTimeout: 20000,
    };
    if (privateKey) {
      cfg.privateKey = privateKey;
      if (msg.passphrase) cfg.passphrase = String(msg.passphrase);
    } else {
      cfg.password = password;
    }
    try {
      ssh.connect(cfg);
    } catch (e) {
      sendJson(ws, { type: 'error', message: e?.message || String(e) });
      cleanup();
    }
  });

  ws.on('close', () => cleanup());
  ws.on('error', () => cleanup());
}

function serveStatic(req, res) {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'oh-myssh',
        mode: 'webssh-all-in-one',
        userNeeds: 'browser only — no local install',
      })
    );
    return;
  }

  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Prevent path traversal
  const filePath = path.normalize(path.join(DIST, urlPath));
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      fs.readFile(path.join(DIST, 'index.html'), (err2, html) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end(
            'UI not built. Run: npm run build && npm start\n' +
              'Or for dev: npm run dev'
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

if (!fs.existsSync(DIST)) {
  console.warn('[oh-myssh] dist/ missing — run `npm run build` before `npm start`');
}

const server = http.createServer(serveStatic);
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '').split('?')[0];
  // Accept both production path and vite-dev path name
  if (pathname === '/ssh' || pathname === '/ssh-ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      attachSshSession(ws);
    });
    return;
  }
  socket.destroy();
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Oh My SSH — WebSSH (all-in-one)');
  console.log('  ─────────────────────────────────');
  console.log(`  Open in browser:  http://127.0.0.1:${PORT}`);
  console.log(`  WebSocket SSH:    ws://127.0.0.1:${PORT}/ssh`);
  console.log('');
  console.log('  End users: open the URL only. No download. No local install.');
  console.log('');
});
