/**
 * Oh My SSH — WebSSH Gateway
 *
 * Classic WebSSH architecture (same idea as webssh2):
 *   Browser (UI only)  --WebSocket-->  This gateway  --TCP/22 SSH-->  User's VPS
 *
 * The browser never opens raw TCP. Users just open the webpage.
 *
 * Protocol:
 *   1) Client connects to ws(s)://host/ssh
 *   2) Client sends JSON text:
 *      { "type":"connect", "host", "port", "username", "password?", "privateKey?",
 *        "cols", "rows" }
 *   3) Server replies JSON: { "type":"ready" } or { "type":"error", "message" }
 *   4) Thereafter binary frames = PTY bytes both ways
 *   5) Control (text JSON): { "type":"resize", "cols", "rows" }
 *                           { "type":"ping" }
 */
import http from 'node:http';
import { WebSocketServer } from 'ws';
import { Client } from 'ssh2';

const PORT = Number(process.env.OMS_GATEWAY_PORT || 3922);
const HOST = process.env.OMS_GATEWAY_HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        ok: true,
        service: 'oh-myssh-webssh-gateway',
        path: '/ssh',
        hint: 'Browser UI connects via WebSocket; gateway dials real SSH for you.',
      })
    );
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const wss = new WebSocketServer({ server, path: '/ssh' });

function sendJson(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

wss.on('connection', (ws) => {
  /** @type {import('ssh2').Client | null} */
  let ssh = null;
  /** @type {import('ssh2').ClientChannel | null} */
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
    // After shell is up: binary (or raw text) → PTY
    if (connected && shell) {
      if (isBinary) {
        shell.write(Buffer.isBuffer(data) ? data : Buffer.from(data));
        return;
      }
      const text = data.toString();
      try {
        const msg = JSON.parse(text);
        if (msg.type === 'resize') {
          const rows = Number(msg.rows) || 24;
          const cols = Number(msg.cols) || 80;
          try {
            shell.setWindow(rows, cols, 0, 0);
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
        // plain text keystrokes
      }
      shell.write(text);
      return;
    }

    // Handshake phase: expect JSON connect
    if (isBinary) {
      sendJson(ws, { type: 'error', message: 'Expected JSON connect message first' });
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

    sendJson(ws, { type: 'status', status: 'connecting', target: `${username}@${host}:${port}` });

    ssh = new Client();

    ssh.on('ready', () => {
      ssh.shell(
        {
          term: 'xterm-256color',
          cols,
          rows,
        },
        (err, stream) => {
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
            if (ws.readyState === ws.OPEN) {
              ws.send(chunk, { binary: true });
            }
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

          stream.stderr?.on('data', (chunk) => {
            if (ws.readyState === ws.OPEN) {
              ws.send(chunk, { binary: true });
            }
          });
        }
      );
    });

    ssh.on('error', (err) => {
      sendJson(ws, {
        type: 'error',
        message: err?.message || String(err),
      });
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
      tryKeyboard: false,
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
});

server.listen(PORT, HOST, () => {
  console.log(`[oh-myssh-gateway] WebSSH gateway listening on http://${HOST}:${PORT}`);
  console.log(`[oh-myssh-gateway] WebSocket path: ws://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}/ssh`);
  console.log(`[oh-myssh-gateway] Health: http://127.0.0.1:${PORT}/health`);
});
