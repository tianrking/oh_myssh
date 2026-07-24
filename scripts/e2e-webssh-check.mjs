/**
 * E2E: WebSSH gateway → real SSH host
 * Usage:
 *   OMS_SSH_PASSWORD=xxx node scripts/e2e-webssh-check.mjs
 *   (gateway must be running on :3922, or this script starts nothing — run npm run gateway first)
 */
import WebSocket from 'ws';

const host = process.env.OMS_SSH_HOST || process.argv[2] || 'de.w0x7ce.eu';
const user = process.env.OMS_SSH_USER || process.argv[3] || 'root';
const password = process.env.OMS_SSH_PASSWORD || process.argv[4] || '';
const gw = process.env.OMS_GATEWAY_WS || 'ws://127.0.0.1:3922/ssh';

if (!password) {
  console.error('Set OMS_SSH_PASSWORD');
  process.exit(2);
}

const ws = new WebSocket(gw);
ws.binaryType = 'arraybuffer';

await new Promise((res, rej) => {
  ws.once('open', res);
  ws.once('error', rej);
  setTimeout(() => rej(new Error('gateway ws timeout')), 8000);
});

console.log('gateway open');

const ready = new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error('ready timeout')), 20000);
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ready') {
        clearTimeout(t);
        res(msg);
      }
      if (msg.type === 'error') {
        clearTimeout(t);
        rej(new Error(msg.message));
      }
    } catch {
      /* ignore */
    }
  });
});

ws.send(
  JSON.stringify({
    type: 'connect',
    host,
    port: 22,
    username: user,
    password,
    cols: 100,
    rows: 30,
  })
);

await ready;
console.log('ssh ready via gateway');

let out = '';
ws.on('message', (data, isBinary) => {
  if (isBinary) out += Buffer.from(data).toString('utf8');
  else {
    try {
      const m = JSON.parse(data.toString());
      if (m.type !== 'ready' && m.type !== 'status') out += data.toString();
    } catch {
      out += data.toString();
    }
  }
});

ws.send(Buffer.from('echo WEBSSH_E2E_OK && hostname && whoami\n'));
await new Promise((r) => setTimeout(r, 3000));
ws.close();

if (!out.includes('WEBSSH_E2E_OK')) {
  console.error('FAIL output=', out.slice(0, 500));
  process.exit(1);
}
console.log('WEBSSH_E2E_OK');
console.log(out.split('\n').filter(Boolean).slice(-8).join('\n'));
