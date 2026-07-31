import { Buffer } from 'buffer';
import { generateKeyPairSync } from 'node:crypto';
import net from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NodeStream } from '@microsoft/dev-tunnels-ssh';
import ssh2 from 'ssh2';
import { connectSftpOverStream, connectSshOverStream, type SshShellSession } from '../client';

const USERNAME = 'fixture-user';
const PASSWORD = 'fixture-password';
const { Server } = ssh2;
// SFTP v3 wire constants. ssh2's CommonJS root does not export them in every release.
const OPEN_MODE = { READ: 1, WRITE: 2, CREAT: 8, TRUNC: 16 } as const;
const STATUS_CODE = { OK: 0, EOF: 1, NO_SUCH_FILE: 2, FAILURE: 4 } as const;

type VirtualHandle = {
  kind: 'file' | 'directory';
  path: string;
  listed?: boolean;
};

function fileAttributes(size: number) {
  return {
    size,
    mode: 0o100644,
    uid: 1000,
    gid: 1000,
    atime: Math.floor(Date.now() / 1000),
    mtime: Math.floor(Date.now() / 1000),
  };
}

describe.sequential('browser SSH client interoperability', () => {
  const files = new Map<string, Buffer>([['/welcome.txt', Buffer.from('fixture welcome\n')]]);
  const clients = new Set<{ end(): void }>();
  let server: Server;
  let port = 0;
  let sawPty = false;
  let shellRequests = 0;
  let lastWindow: { cols: number; rows: number } | undefined;

  beforeAll(async () => {
    const hostKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'pem',
      type: 'pkcs1',
    });

    server = new Server({ hostKeys: [hostKey] }, (client) => {
      clients.add(client);
      client
        .on('error', () => {
          // Closing an in-memory fixture immediately after SSH disconnect can surface
          // ECONNRESET on the server side; it is not a protocol failure.
        })
        .on('authentication', (context) => {
          if (
            context.method === 'password' &&
            context.username === USERNAME &&
            context.password === PASSWORD
          ) {
            context.accept();
          } else {
            context.reject();
          }
        })
        .on('ready', () => {
          client.on('session', (accept) => {
            const session = accept();
            session.on('pty', (acceptPty) => {
              sawPty = true;
              acceptPty?.();
            });
            session.on('window-change', (acceptWindow, _reject, info) => {
              lastWindow = { cols: info.cols, rows: info.rows };
              acceptWindow?.();
            });
            session.on('shell', (acceptShell) => {
              shellRequests += 1;
              const shell = acceptShell();
              shell.write('fixture-shell-ready\r\n');
              shell.on('data', (data: Buffer) => {
                const input = data.toString('utf8');
                if (input.includes('OMS_E2E_PROBE')) shell.write('OMS_E2E_OK\r\n');
              });
            });
            session.on('sftp', (acceptSftp) => {
              const sftp = acceptSftp();
              const handles = new Map<number, VirtualHandle>();
              let nextHandle = 1;
              const issueHandle = (requestId: number, value: VirtualHandle) => {
                const handle = Buffer.alloc(4);
                handle.writeUInt32BE(nextHandle, 0);
                handles.set(nextHandle, value);
                nextHandle += 1;
                sftp.handle(requestId, handle);
              };
              const lookup = (handle: Buffer) =>
                handle.length === 4 ? handles.get(handle.readUInt32BE(0)) : undefined;

              sftp
                .on('REALPATH', (requestId, requestedPath) => {
                  const normalized = requestedPath === '.' ? '/home/fixture-user' : requestedPath;
                  sftp.name(requestId, [{ filename: normalized, longname: normalized, attrs: {} }]);
                })
                .on('STAT', (requestId, requestedPath) => {
                  const data = files.get(requestedPath);
                  if (!data) return sftp.status(requestId, STATUS_CODE.NO_SUCH_FILE);
                  sftp.attrs(requestId, fileAttributes(data.byteLength));
                })
                .on('OPEN', (requestId, requestedPath, flags) => {
                  const wantsRead = (flags & OPEN_MODE.READ) !== 0;
                  const wantsWrite = (flags & OPEN_MODE.WRITE) !== 0;
                  if (wantsRead && !files.has(requestedPath)) {
                    return sftp.status(requestId, STATUS_CODE.NO_SUCH_FILE);
                  }
                  if (wantsWrite && (flags & OPEN_MODE.TRUNC) !== 0) files.set(requestedPath, Buffer.alloc(0));
                  issueHandle(requestId, { kind: 'file', path: requestedPath });
                })
                .on('READ', (requestId, handle, offset, length) => {
                  const opened = lookup(handle);
                  const data = opened?.kind === 'file' ? files.get(opened.path) : undefined;
                  const start = Number(offset);
                  if (!data || !Number.isSafeInteger(start)) {
                    return sftp.status(requestId, STATUS_CODE.FAILURE);
                  }
                  if (start >= data.byteLength) return sftp.status(requestId, STATUS_CODE.EOF);
                  sftp.data(requestId, data.subarray(start, Math.min(start + length, data.byteLength)));
                })
                .on('WRITE', (requestId, handle, offset, chunk) => {
                  const opened = lookup(handle);
                  const start = Number(offset);
                  if (opened?.kind !== 'file' || !Number.isSafeInteger(start) || start < 0) {
                    return sftp.status(requestId, STATUS_CODE.FAILURE);
                  }
                  const current = files.get(opened.path) || Buffer.alloc(0);
                  const output = Buffer.alloc(Math.max(current.byteLength, start + chunk.byteLength));
                  current.copy(output);
                  chunk.copy(output, start);
                  files.set(opened.path, output);
                  sftp.status(requestId, STATUS_CODE.OK);
                })
                .on('CLOSE', (requestId, handle) => {
                  if (handle.length !== 4 || !handles.delete(handle.readUInt32BE(0))) {
                    return sftp.status(requestId, STATUS_CODE.FAILURE);
                  }
                  sftp.status(requestId, STATUS_CODE.OK);
                })
                .on('OPENDIR', (requestId, requestedPath) => {
                  if (requestedPath !== '/') return sftp.status(requestId, STATUS_CODE.NO_SUCH_FILE);
                  issueHandle(requestId, { kind: 'directory', path: '/', listed: false });
                })
                .on('READDIR', (requestId, handle) => {
                  const opened = lookup(handle);
                  if (opened?.kind !== 'directory') return sftp.status(requestId, STATUS_CODE.FAILURE);
                  if (opened.listed) return sftp.status(requestId, STATUS_CODE.EOF);
                  opened.listed = true;
                  sftp.name(
                    requestId,
                    [...files.entries()].map(([filename, data]) => ({
                      filename: filename.slice(1),
                      longname: `-rw-r--r-- 1 fixture fixture ${data.byteLength} ${filename.slice(1)}`,
                      attrs: fileAttributes(data.byteLength),
                    })),
                  );
                })
                .on('RENAME', (requestId, oldPath, newPath) => {
                  const data = files.get(oldPath);
                  if (!data) return sftp.status(requestId, STATUS_CODE.NO_SUCH_FILE);
                  files.set(newPath, data);
                  files.delete(oldPath);
                  sftp.status(requestId, STATUS_CODE.OK);
                })
                .on('REMOVE', (requestId, requestedPath) => {
                  sftp.status(
                    requestId,
                    files.delete(requestedPath) ? STATUS_CODE.OK : STATUS_CODE.NO_SUCH_FILE,
                  );
                });
            });
          });
        })
        .on('close', () => clients.delete(client));
    });

    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        port = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterAll(async () => {
    for (const client of clients) client.end();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('performs host verification, password auth, PTY shell, resize, and SFTP v3 transfers', async () => {
    const socket = net.connect({ host: '127.0.0.1', port });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    let confirmations = 0;
    let connection: SshShellSession | undefined;
    try {
      connection = await connectSshOverStream(
        {
          host: '127.0.0.1',
          port,
          auth: { username: USERNAME, password: PASSWORD },
          confirmHostKey: async (prompt) => {
            confirmations += 1;
            expect(prompt.status).toBe('first-seen');
            expect(prompt.fingerprint).toMatch(/^SHA256:/u);
            return true;
          },
        },
        new NodeStream(socket),
        'direct',
        10_000,
      );

      expect(sawPty).toBe(true);
      connection.write('OMS_E2E_PROBE\n');
      connection.resize(132, 43);
      const reader = connection.stream.readable.getReader();
      let output = '';
      const deadline = Date.now() + 5_000;
      while (!output.includes('OMS_E2E_OK') && Date.now() < deadline) {
        const result = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Timed out waiting for shell output')), 5_000),
          ),
        ]);
        if (result.done) break;
        output += new TextDecoder().decode(result.value);
      }
      reader.releaseLock();
      expect(output).toContain('fixture-shell-ready');
      expect(output).toContain('OMS_E2E_OK');
      await expect.poll(() => lastWindow).toEqual({ cols: 132, rows: 43 });

      const sftp = await connection.openSftp();
      try {
        await expect(sftp.realpath('.')).resolves.toBe('/home/fixture-user');
        const payload = new TextEncoder().encode('SFTP integration payload\n');
        await sftp.writeFile('/uploaded.txt', payload);
        await expect(sftp.readFile('/uploaded.txt')).resolves.toEqual(payload);
        await expect(sftp.stat('/uploaded.txt')).resolves.toMatchObject({ size: payload.byteLength });
        const listing = await sftp.list('/');
        expect(listing.map((entry) => entry.name)).toContain('uploaded.txt');
        expect([...files.keys()].some((name) => name.includes('.ohmyssh-'))).toBe(false);
      } finally {
        await sftp.close();
      }

      const sftpSocket = net.connect({ host: '127.0.0.1', port });
      sftpSocket.on('error', () => undefined);
      await new Promise<void>((resolve) => sftpSocket.once('connect', resolve));
      const sftpOnly = await connectSftpOverStream(
        {
          host: '127.0.0.1',
          port,
          auth: { username: USERNAME, password: PASSWORD },
          confirmHostKey: async () => {
            throw new Error('Matching known host should not prompt again');
          },
        },
        new NodeStream(sftpSocket),
        'direct',
        10_000,
      );
      try {
        await expect(sftpOnly.client.readFile('/welcome.txt')).resolves.toEqual(
          new Uint8Array(Buffer.from('fixture welcome\n')),
        );
        expect(shellRequests).toBe(1);
      } finally {
        await sftpOnly.close();
        sftpSocket.destroy();
      }
      expect(confirmations).toBe(1);
    } finally {
      await connection?.close();
      socket.destroy();
    }
  }, 20_000);
});
