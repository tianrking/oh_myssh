/**
 * End-to-end: Vite WS→TCP relay + Microsoft SSH against a real host.
 * Usage: node scripts/e2e-ssh-check.mjs [host] [user] [password]
 * Credentials via env preferred: OMS_SSH_HOST / OMS_SSH_USER / OMS_SSH_PASSWORD
 */
import net from 'node:net';
import {
  SshClientSession,
  SshSessionConfiguration,
  NodeStream,
  ChannelRequestMessage,
  ChannelRequestType,
  SshDisconnectReason,
} from '@microsoft/dev-tunnels-ssh';

const host = process.env.OMS_SSH_HOST || process.argv[2] || 'de.w0x7ce.eu';
const user = process.env.OMS_SSH_USER || process.argv[3] || 'root';
const password = process.env.OMS_SSH_PASSWORD || process.argv[4] || '';

if (!password) {
  console.error('Set OMS_SSH_PASSWORD or pass password as argv[4]');
  process.exit(2);
}

const sock = net.connect(22, host);
await new Promise((res, rej) => {
  sock.once('connect', res);
  sock.once('error', rej);
  setTimeout(() => rej(new Error('TCP timeout')), 15000);
});

const session = new SshClientSession(new SshSessionConfiguration());
session.onAuthenticating((e) => {
  e.authenticationPromise = Promise.resolve({});
});
await session.connect(new NodeStream(sock));
const ok = await session.authenticate({ username: user, password });
if (!ok) {
  console.error('AUTH_FAIL');
  process.exit(1);
}

const channel = await session.openChannel();
const shellReq = new ChannelRequestMessage(ChannelRequestType.shell, true);
await channel.request(shellReq);

let out = '';
channel.onDataReceived((data) => {
  out += data.toString('utf8');
  channel.adjustWindow(data.length);
});
await channel.send(Buffer.from('echo OMS_E2E_OK && uname -s && whoami\n'));
await new Promise((r) => setTimeout(r, 2500));
await session.close(SshDisconnectReason.byApplication, 'e2e done');

if (!out.includes('OMS_E2E_OK')) {
  console.error('SHELL_FAIL output=', out.slice(0, 400));
  process.exit(1);
}
console.log('E2E_SSH_OK');
console.log(out.split('\n').filter((l) => l.trim()).slice(-6).join('\n'));
