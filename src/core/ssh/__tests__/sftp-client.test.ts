import { Buffer } from 'buffer';
import type { SshChannel } from '@microsoft/dev-tunnels-ssh';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SftpClient } from '../sftp-client';

const FXP = {
  INIT: 1,
  VERSION: 2,
  REALPATH: 16,
  NAME: 104,
} as const;

const MAX_PACKET_BYTES = 16 * 1024 * 1024;

function uint32(value: number): Buffer {
  const output = Buffer.alloc(4);
  output.writeUInt32BE(value, 0);
  return output;
}

function sshString(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8');
  return Buffer.concat([uint32(bytes.length), bytes]);
}

function frame(body: Buffer): Buffer {
  return Buffer.concat([uint32(body.length), body]);
}

function versionPacket(version = 3): Buffer {
  return Buffer.concat([Buffer.from([FXP.VERSION]), uint32(version)]);
}

function realpathPacket(id: number, path: string): Buffer {
  return Buffer.concat([
    Buffer.from([FXP.NAME]),
    uint32(id),
    uint32(1),
    sshString(path),
    sshString(path),
    uint32(0),
  ]);
}

type SendHandler = (packet: Buffer, channel: FakeSftpChannel) => void;

class FakeSftpChannel {
  private listener: ((data: Buffer) => void) | undefined;
  private sendingType: number | undefined;
  readonly sentTypes: number[] = [];
  readonly synchronousResponseTypes: number[] = [];
  adjustedBytes = 0;
  closed = false;
  disposed = false;

  constructor(private readonly onSend: SendHandler) {}

  onDataReceived(listener: (data: Buffer) => void): { dispose(): void } {
    this.listener = listener;
    return {
      dispose: () => {
        this.disposed = true;
        if (this.listener === listener) this.listener = undefined;
      },
    };
  }

  adjustWindow(bytes: number): void {
    this.adjustedBytes += bytes;
  }

  async send(packet: Buffer): Promise<void> {
    const copy = Buffer.from(packet);
    const type = copy.readUInt8(4);
    this.sentTypes.push(type);
    this.sendingType = type;
    try {
      this.onSend(copy, this);
    } finally {
      this.sendingType = undefined;
    }
  }

  emitBody(body: Buffer): void {
    if (this.sendingType !== undefined) this.synchronousResponseTypes.push(this.sendingType);
    this.listener?.(frame(body));
  }

  emitRaw(data: Buffer): void {
    if (this.sendingType !== undefined) this.synchronousResponseTypes.push(this.sendingType);
    this.listener?.(Buffer.from(data));
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  asSshChannel(): SshChannel {
    return this as unknown as SshChannel;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('SftpClient protocol lifecycle', () => {
  it('handles a VERSION response emitted synchronously from INIT and resolves REALPATH', async () => {
    const channel = new FakeSftpChannel((packet, fake) => {
      const type = packet.readUInt8(4);
      if (type === FXP.INIT) {
        expect(packet.readUInt32BE(5)).toBe(3);
        fake.emitBody(versionPacket());
        return;
      }
      if (type === FXP.REALPATH) {
        const requestId = packet.readUInt32BE(5);
        fake.emitBody(realpathPacket(requestId, '/home/tester'));
      }
    });
    const client = new SftpClient(channel.asSshChannel());

    await expect(client.realpath('.')).resolves.toBe('/home/tester');
    expect(channel.synchronousResponseTypes).toContain(FXP.INIT);
    expect(channel.sentTypes).toEqual([FXP.INIT, FXP.REALPATH]);
    expect(channel.adjustedBytes).toBeGreaterThan(0);

    await client.close();
    expect(channel.closed).toBe(true);
    expect(channel.disposed).toBe(true);
  });

  it('rejects pending work and closes the channel on an oversized packet declaration', async () => {
    const channel = new FakeSftpChannel((packet, fake) => {
      const type = packet.readUInt8(4);
      if (type === FXP.INIT) {
        fake.emitBody(versionPacket());
        return;
      }
      if (type === FXP.REALPATH) {
        const invalidHeader = Buffer.alloc(4);
        invalidHeader.writeUInt32BE(MAX_PACKET_BYTES + 1, 0);
        fake.emitRaw(invalidHeader);
      }
    });
    const client = new SftpClient(channel.asSshChannel());

    await expect(client.realpath('/oversized')).rejects.toThrow(
      `Invalid SFTP packet length: ${MAX_PACKET_BYTES + 1}`,
    );
    expect((client as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    expect(channel.closed).toBe(true);
    expect(channel.disposed).toBe(true);
  });

  it('removes a timed-out request from the pending map', async () => {
    vi.useFakeTimers();
    const channel = new FakeSftpChannel((packet, fake) => {
      if (packet.readUInt8(4) === FXP.INIT) fake.emitBody(versionPacket());
    });
    const client = new SftpClient(channel.asSshChannel());
    const request = client.realpath('/never-answers');
    const rejection = expect(request).rejects.toThrow(`SFTP request ${FXP.REALPATH} timed out`);

    for (let turn = 0; turn < 20 && !channel.sentTypes.includes(FXP.REALPATH); turn++) {
      await Promise.resolve();
    }
    expect(channel.sentTypes).toContain(FXP.REALPATH);
    expect((client as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);

    await vi.advanceTimersByTimeAsync(30_001);
    await rejection;
    expect((client as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);

    await client.close();
  });
});
