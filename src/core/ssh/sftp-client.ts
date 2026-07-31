import { Buffer } from 'buffer';
import type { SshChannel } from '@microsoft/dev-tunnels-ssh';

const FXP = {
  INIT: 1,
  VERSION: 2,
  OPEN: 3,
  CLOSE: 4,
  READ: 5,
  WRITE: 6,
  LSTAT: 7,
  OPENDIR: 11,
  READDIR: 12,
  REMOVE: 13,
  MKDIR: 14,
  RMDIR: 15,
  REALPATH: 16,
  STAT: 17,
  RENAME: 18,
  STATUS: 101,
  HANDLE: 102,
  DATA: 103,
  NAME: 104,
  ATTRS: 105,
} as const;

const FX_OK = 0;
const FX_EOF = 1;
const FXF_READ = 0x00000001;
const FXF_WRITE = 0x00000002;
const FXF_CREAT = 0x00000008;
const FXF_TRUNC = 0x00000010;
const ATTR_SIZE = 0x00000001;
const ATTR_UID_GID = 0x00000002;
const ATTR_PERMISSIONS = 0x00000004;
const ATTR_ACMODTIME = 0x00000008;
const ATTR_EXTENDED = 0x80000000;
const MAX_PACKET_BYTES = 16 * 1024 * 1024;
const MAX_RECEIVE_BUFFER = 32 * 1024 * 1024;
const TRANSFER_CHUNK_BYTES = 128 * 1024;
const MAX_BUFFERED_FILE_BYTES = 256 * 1024 * 1024;

export type SftpEntry = {
  name: string;
  longname: string;
  isDir: boolean;
  size: number;
  permissions: number;
  mtime: number;
};

export type SftpAttributes = {
  size: number;
  permissions: number;
  mtime: number;
};

type Pending = {
  resolve: (packet: Buffer) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function copyBytes(bytes: Uint8Array): Uint8Array {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export class SftpClient {
  private requestId = 1;
  private pending = new Map<number, Pending>();
  private receiveBuffer = Buffer.alloc(0);
  private readonly ready: Promise<void>;
  private disposed = false;
  private readonly dataDisposable: { dispose(): void };
  private versionResolve!: () => void;
  private versionReject!: (error: Error) => void;
  private extensions = new Map<string, string>();

  constructor(private readonly channel: SshChannel) {
    const versionPromise = new Promise<void>((resolve, reject) => {
      this.versionResolve = resolve;
      this.versionReject = reject;
    });
    this.dataDisposable = channel.onDataReceived((data) => {
      if (this.disposed) return;
      if (this.receiveBuffer.length + data.length > MAX_RECEIVE_BUFFER) {
        this.fail(new Error('SFTP receive buffer limit exceeded'));
        return;
      }
      this.receiveBuffer = Buffer.concat([this.receiveBuffer, data]);
      channel.adjustWindow(data.length);
      this.drain();
    });
    this.ready = this.initialize(versionPromise);
  }

  private async initialize(versionPromise: Promise<void>): Promise<void> {
    const body = Buffer.alloc(5);
    body.writeUInt8(FXP.INIT, 0);
    body.writeUInt32BE(3, 1);
    await this.sendFrame(body);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        versionPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('SFTP initialization timed out')), 10_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private drain(): void {
    while (!this.disposed && this.receiveBuffer.length >= 4) {
      const packetLength = this.receiveBuffer.readUInt32BE(0);
      if (packetLength < 1 || packetLength > MAX_PACKET_BYTES) {
        this.fail(new Error(`Invalid SFTP packet length: ${packetLength}`));
        return;
      }
      if (this.receiveBuffer.length < 4 + packetLength) return;
      const packet = this.receiveBuffer.subarray(4, 4 + packetLength);
      this.receiveBuffer = this.receiveBuffer.subarray(4 + packetLength);
      const type = packet.readUInt8(0);

      if (type === FXP.VERSION) {
        try {
          if (packet.length < 5) throw new Error('Malformed SFTP VERSION packet');
          const version = packet.readUInt32BE(1);
          if (version < 3) throw new Error(`Unsupported SFTP version: ${version}`);
          let offset = 5;
          while (offset < packet.length) {
            const [name, next] = this.readString(packet, offset);
            const [value, after] = this.readString(packet, next);
            this.extensions.set(name, value);
            offset = after;
          }
          this.versionResolve();
        } catch (error) {
          this.versionReject(error instanceof Error ? error : new Error(String(error)));
        }
        continue;
      }

      if (packet.length < 5) {
        this.fail(new Error('Malformed SFTP response packet'));
        return;
      }
      const id = packet.readUInt32BE(1);
      const request = this.pending.get(id);
      if (!request) continue;
      this.pending.delete(id);
      clearTimeout(request.timer);
      request.resolve(packet);
    }
  }

  private fail(error: Error): void {
    this.versionReject?.(error);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.receiveBuffer = Buffer.alloc(0);
    void this.close();
  }

  private nextRequestId(): number {
    const id = this.requestId;
    this.requestId = this.requestId >= 0x7fffffff ? 1 : this.requestId + 1;
    return id;
  }

  private async sendFrame(body: Buffer): Promise<void> {
    if (this.disposed) throw new Error('SFTP client is closed');
    if (body.length > MAX_PACKET_BYTES) throw new Error('SFTP request is too large');
    const frame = Buffer.allocUnsafe(4 + body.length);
    frame.writeUInt32BE(body.length, 0);
    body.copy(frame, 4);
    await this.channel.send(frame);
  }

  private sendRequest(type: number, payload: Buffer, timeoutMs = 30_000): Promise<Buffer> {
    if (this.disposed) return Promise.reject(new Error('SFTP client is closed'));
    const id = this.nextRequestId();
    const body = Buffer.allocUnsafe(5 + payload.length);
    body.writeUInt8(type, 0);
    body.writeUInt32BE(id, 1);
    payload.copy(body, 5);

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`SFTP request ${type} timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.sendFrame(body).catch((error) => {
        const request = this.pending.get(id);
        if (!request) return;
        this.pending.delete(id);
        clearTimeout(request.timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private writeString(value: string | Uint8Array): Buffer {
    const bytes = typeof value === 'string' ? Buffer.from(value, 'utf8') : Buffer.from(value);
    if (bytes.length > 64 * 1024) throw new Error('SFTP string is too large');
    const output = Buffer.allocUnsafe(4 + bytes.length);
    output.writeUInt32BE(bytes.length, 0);
    bytes.copy(output, 4);
    return output;
  }

  private readString(buffer: Buffer, offset: number): [string, number] {
    if (offset < 0 || offset + 4 > buffer.length) throw new Error('Malformed SFTP string length');
    const length = buffer.readUInt32BE(offset);
    if (length > MAX_PACKET_BYTES || offset + 4 + length > buffer.length) {
      throw new Error('Malformed SFTP string data');
    }
    return [buffer.subarray(offset + 4, offset + 4 + length).toString('utf8'), offset + 4 + length];
  }

  private readAttributes(buffer: Buffer, offset: number): [SftpAttributes, number] {
    if (offset + 4 > buffer.length) throw new Error('Malformed SFTP attributes');
    const flags = buffer.readUInt32BE(offset);
    offset += 4;
    let size = 0;
    let permissions = 0;
    let mtime = 0;
    if (flags & ATTR_SIZE) {
      if (offset + 8 > buffer.length) throw new Error('Malformed SFTP size');
      size = buffer.readUInt32BE(offset) * 0x100000000 + buffer.readUInt32BE(offset + 4);
      if (!Number.isSafeInteger(size)) throw new Error('SFTP file size exceeds JavaScript safe integer range');
      offset += 8;
    }
    if (flags & ATTR_UID_GID) {
      if (offset + 8 > buffer.length) throw new Error('Malformed SFTP uid/gid');
      offset += 8;
    }
    if (flags & ATTR_PERMISSIONS) {
      if (offset + 4 > buffer.length) throw new Error('Malformed SFTP permissions');
      permissions = buffer.readUInt32BE(offset);
      offset += 4;
    }
    if (flags & ATTR_ACMODTIME) {
      if (offset + 8 > buffer.length) throw new Error('Malformed SFTP timestamps');
      mtime = buffer.readUInt32BE(offset + 4);
      offset += 8;
    }
    if (flags & ATTR_EXTENDED) {
      if (offset + 4 > buffer.length) throw new Error('Malformed SFTP extended attribute count');
      const count = buffer.readUInt32BE(offset);
      offset += 4;
      if (count > 4096) throw new Error('Too many SFTP extended attributes');
      for (let i = 0; i < count; i++) {
        [, offset] = this.readString(buffer, offset);
        [, offset] = this.readString(buffer, offset);
      }
    }
    return [{ size, permissions, mtime }, offset];
  }

  private statusCode(packet: Buffer): number | null {
    return packet.readUInt8(0) === FXP.STATUS ? packet.readUInt32BE(5) : null;
  }

  private ensureStatusOk(packet: Buffer, action: string): void {
    const code = this.statusCode(packet);
    if (code === null) throw new Error(`SFTP ${action} returned an unexpected packet`);
    if (code === FX_OK) return;
    let message = action;
    try {
      [message] = this.readString(packet, 9);
    } catch {
      // Status messages are optional.
    }
    throw new Error(`SFTP ${action} failed (code ${code}): ${message || action}`);
  }

  private async openFile(path: string, flags: number): Promise<Buffer> {
    const attrs = Buffer.alloc(4);
    const flagBytes = Buffer.alloc(4);
    flagBytes.writeUInt32BE(flags, 0);
    const packet = await this.sendRequest(FXP.OPEN, Buffer.concat([this.writeString(path), flagBytes, attrs]));
    if (packet.readUInt8(0) !== FXP.HANDLE) {
      this.ensureStatusOk(packet, 'open');
      throw new Error('SFTP open failed');
    }
    if (packet.length < 9) throw new Error('Malformed SFTP file handle');
    const length = packet.readUInt32BE(5);
    if (!length || 9 + length > packet.length) throw new Error('Malformed SFTP file handle');
    return packet.subarray(9, 9 + length);
  }

  private handlePayload(handle: Buffer): Buffer {
    return this.writeString(handle);
  }

  private async closeHandle(handle: Buffer): Promise<void> {
    const packet = await this.sendRequest(FXP.CLOSE, this.handlePayload(handle));
    this.ensureStatusOk(packet, 'close');
  }

  async realpath(path: string): Promise<string> {
    await this.ready;
    const packet = await this.sendRequest(FXP.REALPATH, this.writeString(path));
    if (packet.readUInt8(0) !== FXP.NAME) {
      this.ensureStatusOk(packet, 'realpath');
      throw new Error('SFTP realpath failed');
    }
    if (packet.readUInt32BE(5) < 1) throw new Error('SFTP realpath returned no path');
    return this.readString(packet, 9)[0];
  }

  async stat(path: string): Promise<SftpAttributes> {
    await this.ready;
    const packet = await this.sendRequest(FXP.STAT, this.writeString(path));
    if (packet.readUInt8(0) !== FXP.ATTRS) {
      this.ensureStatusOk(packet, 'stat');
      throw new Error('SFTP stat failed');
    }
    return this.readAttributes(packet, 5)[0];
  }

  async list(path: string): Promise<SftpEntry[]> {
    await this.ready;
    const openPacket = await this.sendRequest(FXP.OPENDIR, this.writeString(path));
    if (openPacket.readUInt8(0) !== FXP.HANDLE) {
      this.ensureStatusOk(openPacket, 'opendir');
      throw new Error('SFTP opendir failed');
    }
    const handleLength = openPacket.readUInt32BE(5);
    if (!handleLength || 9 + handleLength > openPacket.length) throw new Error('Malformed directory handle');
    const handle = openPacket.subarray(9, 9 + handleLength);
    const entries: SftpEntry[] = [];
    try {
      while (entries.length <= 10_000) {
        const packet = await this.sendRequest(FXP.READDIR, this.handlePayload(handle));
        const status = this.statusCode(packet);
        if (status === FX_EOF) break;
        if (status !== null) {
          this.ensureStatusOk(packet, 'readdir');
          break;
        }
        if (packet.readUInt8(0) !== FXP.NAME || packet.length < 9) throw new Error('Malformed readdir response');
        const count = packet.readUInt32BE(5);
        if (count > 10_000 || entries.length + count > 10_000) throw new Error('Directory listing exceeds 10,000 entries');
        let offset = 9;
        for (let i = 0; i < count; i++) {
          let name: string;
          let longname: string;
          [name, offset] = this.readString(packet, offset);
          [longname, offset] = this.readString(packet, offset);
          const [attributes, next] = this.readAttributes(packet, offset);
          offset = next;
          if (name === '.' || name === '..') continue;
          const isDir = (attributes.permissions & 0o170000) === 0o040000 || longname.startsWith('d');
          entries.push({ name, longname, isDir, ...attributes });
        }
      }
    } finally {
      await this.closeHandle(handle).catch(() => undefined);
    }
    return entries.sort((left, right) => {
      if (left.isDir !== right.isDir) return left.isDir ? -1 : 1;
      return left.name.localeCompare(right.name);
    });
  }

  async readFileStream(
    path: string,
    onProgress?: (bytesRead: number, totalBytes: number) => void,
  ): Promise<ReadableStream<Uint8Array>> {
    await this.ready;
    const attributes = await this.stat(path);
    const handle = await this.openFile(path, FXF_READ);
    let offset = 0;
    let finished = false;
    const close = async () => {
      if (finished) return;
      finished = true;
      await this.closeHandle(handle).catch(() => undefined);
    };

    return new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (finished) {
          controller.close();
          return;
        }
        const request = Buffer.allocUnsafe(4 + handle.length + 8 + 4);
        let position = 0;
        request.writeUInt32BE(handle.length, position);
        position += 4;
        handle.copy(request, position);
        position += handle.length;
        request.writeUInt32BE(Math.floor(offset / 0x100000000), position);
        request.writeUInt32BE(offset >>> 0, position + 4);
        position += 8;
        request.writeUInt32BE(TRANSFER_CHUNK_BYTES, position);
        try {
          const packet = await this.sendRequest(FXP.READ, request);
          const status = this.statusCode(packet);
          if (status === FX_EOF) {
            await close();
            controller.close();
            return;
          }
          if (status !== null) this.ensureStatusOk(packet, 'read');
          if (packet.readUInt8(0) !== FXP.DATA || packet.length < 9) throw new Error('Malformed SFTP read response');
          const length = packet.readUInt32BE(5);
          if (length > TRANSFER_CHUNK_BYTES || 9 + length > packet.length) throw new Error('Malformed SFTP data packet');
          if (!length) {
            await close();
            controller.close();
            return;
          }
          const data = copyBytes(packet.subarray(9, 9 + length));
          offset += data.byteLength;
          onProgress?.(offset, attributes.size);
          controller.enqueue(data);
        } catch (error) {
          await close();
          controller.error(error);
        }
      },
      cancel: close,
    });
  }

  async readFile(path: string, onProgress?: (bytesRead: number) => void): Promise<Uint8Array> {
    const attributes = await this.stat(path);
    if (attributes.size > MAX_BUFFERED_FILE_BYTES) {
      throw new Error('File is too large for buffered read; use readFileStream instead');
    }
    const stream = await this.readFileStream(path, (read) => onProgress?.(read));
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_BUFFERED_FILE_BYTES) throw new Error('Buffered SFTP read exceeded its limit');
      chunks.push(value);
    }
    const output = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  }

  private async writeStreamToPath(
    path: string,
    stream: ReadableStream<Uint8Array>,
    onProgress?: (bytesWritten: number) => void,
  ): Promise<number> {
    const handle = await this.openFile(path, FXF_WRITE | FXF_CREAT | FXF_TRUNC);
    const reader = stream.getReader();
    let offset = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.byteLength) continue;
        for (let sourceOffset = 0; sourceOffset < value.byteLength; sourceOffset += TRANSFER_CHUNK_BYTES) {
          const chunk = value.subarray(sourceOffset, Math.min(value.byteLength, sourceOffset + TRANSFER_CHUNK_BYTES));
          const request = Buffer.allocUnsafe(4 + handle.length + 8 + 4 + chunk.byteLength);
          let position = 0;
          request.writeUInt32BE(handle.length, position);
          position += 4;
          handle.copy(request, position);
          position += handle.length;
          request.writeUInt32BE(Math.floor(offset / 0x100000000), position);
          request.writeUInt32BE(offset >>> 0, position + 4);
          position += 8;
          request.writeUInt32BE(chunk.byteLength, position);
          position += 4;
          request.set(chunk, position);
          const packet = await this.sendRequest(FXP.WRITE, request);
          this.ensureStatusOk(packet, 'write');
          offset += chunk.byteLength;
          onProgress?.(offset);
        }
      }
      return offset;
    } finally {
      reader.releaseLock();
      await this.closeHandle(handle).catch(() => undefined);
    }
  }

  async writeFileStream(
    path: string,
    stream: ReadableStream<Uint8Array>,
    onProgress?: (bytesWritten: number) => void,
    atomic = true,
  ): Promise<number> {
    await this.ready;
    if (!atomic) return this.writeStreamToPath(path, stream, onProgress);
    const temporaryPath = `${path}.ohmyssh-${crypto.randomUUID()}.part`;
    try {
      const written = await this.writeStreamToPath(temporaryPath, stream, onProgress);
      await this.rename(temporaryPath, path);
      return written;
    } catch (error) {
      await this.remove(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  async writeFile(path: string, data: Uint8Array, onProgress?: (bytesWritten: number) => void): Promise<void> {
    const copy = copyBytes(data);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(copy);
        controller.close();
      },
    });
    await this.writeFileStream(path, stream, onProgress, true);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    await this.ready;
    const packet = await this.sendRequest(
      FXP.RENAME,
      Buffer.concat([this.writeString(oldPath), this.writeString(newPath)]),
    );
    this.ensureStatusOk(packet, 'rename');
  }

  async remove(path: string): Promise<void> {
    await this.ready;
    const packet = await this.sendRequest(FXP.REMOVE, this.writeString(path));
    this.ensureStatusOk(packet, 'remove');
  }

  async mkdir(path: string): Promise<void> {
    await this.ready;
    const packet = await this.sendRequest(FXP.MKDIR, Buffer.concat([this.writeString(path), Buffer.alloc(4)]));
    this.ensureStatusOk(packet, 'mkdir');
  }

  async rmdir(path: string): Promise<void> {
    await this.ready;
    const packet = await this.sendRequest(FXP.RMDIR, this.writeString(path));
    this.ensureStatusOk(packet, 'rmdir');
  }

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.dataDisposable.dispose();
    const error = new Error('SFTP client closed');
    this.versionReject?.(error);
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.receiveBuffer = Buffer.alloc(0);
    await this.channel.close().catch(() => undefined);
  }
}
