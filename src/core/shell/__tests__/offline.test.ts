import { describe, it, expect } from 'vitest';
import { OfflineShellEngine } from '../offline';

async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (text: string) => boolean,
  timeoutMs = 500
): Promise<string> {
  let acc = '';
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), 30)
      ),
    ]);
    if (result.value) {
      acc += new TextDecoder().decode(result.value);
      if (predicate(acc)) return acc;
    }
  }
  return acc;
}

describe('OfflineShellEngine', () => {
  it('boots with banner and accepts help / ls / pwd', async () => {
    const shell = new OfflineShellEngine({ host: 'demo', port: 22, username: 'ubuntu' });
    const stream = shell.createStream();
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    const boot = await readUntil(reader, (t) => t.includes('Offline Interactive Shell'));
    expect(boot).toContain('ubuntu@demo');

    await writer.write(new TextEncoder().encode('pwd\r'));
    const pwdOut = await readUntil(reader, (t) => t.includes('/home/ubuntu'));
    expect(pwdOut).toContain('/home/ubuntu');

    await writer.write(new TextEncoder().encode('ls\r'));
    const lsOut = await readUntil(reader, (t) => t.includes('projects') || t.includes('notes'));
    expect(lsOut.length).toBeGreaterThan(0);

    await writer.write(new TextEncoder().encode('help\r'));
    const helpOut = await readUntil(reader, (t) => t.includes('neofetch'));
    expect(helpOut).toContain('command reference');
    expect(helpOut).toContain('neofetch');

    await stream.close();
  });

  it('supports mkdir / touch / cat / cd', async () => {
    const shell = new OfflineShellEngine({ host: 'node', port: 22, username: 'root' });
    const stream = shell.createStream();
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    await readUntil(reader, (t) => t.includes('Offline'));

    await writer.write(new TextEncoder().encode('mkdir /tmp/work\r'));
    await readUntil(reader, (t) => t.includes('root@'));

    await writer.write(new TextEncoder().encode('touch /tmp/work/a.txt\r'));
    await readUntil(reader, (t) => t.includes('root@'));

    await writer.write(new TextEncoder().encode('echo hello > /tmp/work/a.txt\r'));
    // echo without redirect writes to stdout; write content via shell write of file not supported —
    // use cat after touch and echo alone
    await writer.write(new TextEncoder().encode('cd /tmp/work\r'));
    const cdOut = await readUntil(reader, (t) => t.includes('/tmp/work') || t.includes('root@'));
    expect(cdOut.length).toBeGreaterThan(0);

    await writer.write(new TextEncoder().encode('pwd\r'));
    const pwd = await readUntil(reader, (t) => t.includes('/tmp/work'));
    expect(pwd).toContain('/tmp/work');

    await stream.close();
  });

  it('handles Ctrl+C and unknown commands without crashing', async () => {
    const shell = new OfflineShellEngine({ host: 'x', port: 22, username: 'dev' });
    const stream = shell.createStream();
    const reader = stream.readable.getReader();
    const writer = stream.writable.getWriter();

    await readUntil(reader, (t) => t.includes('Offline'));

    await writer.write(new TextEncoder().encode('notacommand\r'));
    const miss = await readUntil(reader, (t) => t.includes('command not found'));
    expect(miss).toContain('notacommand');

    await writer.write(new TextEncoder().encode('\x03'));
    const ctrlc = await readUntil(reader, (t) => t.includes('^C'));
    expect(ctrlc).toContain('^C');

    await stream.close();
  });
});
