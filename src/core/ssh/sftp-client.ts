/**
 * Minimal SFTP v3 client over an SSH channel (pure frontend).
 */
import { Buffer } from 'buffer';
import type { SshChannel } from '@microsoft/dev-tunnels-ssh';

const SSH_FXP_INIT = 1;
const SSH_FXP_VERSION = 2;
const SSH_FXP_OPEN = 3;
const SSH_FXP_CLOSE = 4;
const SSH_FXP_READ = 5;
const SSH_FXP_WRITE = 6;
const SSH_FXP_OPENDIR = 11;
const SSH_FXP_READDIR = 12;
const SSH_FXP_REMOVE = 13;
const SSH_FXP_MKDIR = 14;
const SSH_FXP_RMDIR = 15;
const SSH_FXP_REALPATH = 16;
const SSH_FXP_STAT = 17;
const SSH_FXP_STATUS = 101;
const SSH_FXP_HANDLE = 102;
const SSH_FXP_DATA = 103;
const SSH_FXP_NAME = 104;
const SSH_FXP_ATTRS = 105;

const SSH_FXF_READ = 0x00000001;
const SSH_FXF_WRITE = 0x00000002;
const SSH_FXF_CREAT = 0x00000008;
const SSH_FXF_TRUNC = 0x00000010;

const SSH_FILEXFER_ATTR_SIZE = 0x00000001;
const SSH_FILEXFER_ATTR_PERMISSIONS = 0x00000004;
const SSH_FILEXFER_ATTR_ACMODTIME = 0x00000008;

export type SftpEntry = {
  name: string;
  longname: string;
  isDir: boolean;
  size: number;
  permissions: number;
  mtime: number;
};

type Pending = {
  resolve: (pkt: Buffer) => void;
  reject: (err: Error) => void;
};

export class SftpClient {
  private channel: SshChannel;
  private reqId = 1;
  private pending = new Map<number, Pending>();
  private rx = Buffer.alloc(0);
  private ready: Promise<void>;
  private disposed = false;
  private dataDisposable: { dispose(): void };

  constructor(channel: SshChannel) {
    this.channel = channel;
    this.dataDisposable = channel.onDataReceived((data) => {
      this.rx = Buffer.concat([this.rx, data]);
      channel.adjustWindow(data.length);
      this.drain();
    });
    this.ready = this.init();
  }

  private async init() {
    // SSH_FXP_INIT version 3
    const pkt = Buffer.alloc(9);
    pkt.writeUInt32BE(5, 0);
    pkt.writeUInt8(SSH_FXP_INIT, 4);
    pkt.writeUInt32BE(3, 5);
    await this.channel.send(pkt);

    // Wait for VERSION
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SFTP init timeout')), 10000);
      const check = () => {
        if (this.rx.length >= 5) {
          const len = this.rx.readUInt32BE(0);
          if (this.rx.length >= 4 + len) {
            const type = this.rx.readUInt8(4);
            this.rx = this.rx.subarray(4 + len);
            clearTimeout(timer);
            if (type === SSH_FXP_VERSION) resolve();
            else reject(new Error(`SFTP unexpected init type ${type}`));
            return;
          }
        }
        setTimeout(check, 10);
      };
      check();
    });
  }

  private drain() {
    while (this.rx.length >= 5) {
      const len = this.rx.readUInt32BE(0);
      if (this.rx.length < 4 + len) break;
      const body = this.rx.subarray(4, 4 + len);
      this.rx = this.rx.subarray(4 + len);
      const type = body.readUInt8(0);
      if (type === SSH_FXP_VERSION) continue;
      if (body.length < 5) continue;
      const id = body.readUInt32BE(1);
      const pending = this.pending.get(id);
      if (pending) {
        this.pending.delete(id);
        pending.resolve(body);
      }
    }
  }

  private nextId() {
    const id = this.reqId++;
    if (this.reqId > 0x7fffffff) this.reqId = 1;
    return id;
  }

  private sendRequest(type: number, payload: Buffer): Promise<Buffer> {
    const id = this.nextId();
    const body = Buffer.alloc(1 + 4 + payload.length);
    body.writeUInt8(type, 0);
    body.writeUInt32BE(id, 1);
    payload.copy(body, 5);
    const frame = Buffer.alloc(4 + body.length);
    frame.writeUInt32BE(body.length, 0);
    body.copy(frame, 4);

    return new Promise<Buffer>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.channel.send(frame).catch((err) => {
        this.pending.delete(id);
        reject(err);
      });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`SFTP request ${type} timeout`));
        }
      }, 30000);
    });
  }

  private writeString(s: string): Buffer {
    const b = Buffer.from(s, 'utf8');
    const out = Buffer.alloc(4 + b.length);
    out.writeUInt32BE(b.length, 0);
    b.copy(out, 4);
    return out;
  }

  private readString(buf: Buffer, offset: number): [string, number] {
    const len = buf.readUInt32BE(offset);
    const s = buf.subarray(offset + 4, offset + 4 + len).toString('utf8');
    return [s, offset + 4 + len];
  }

  private ensureStatusOk(pkt: Buffer, action: string) {
    const type = pkt.readUInt8(0);
    if (type === SSH_FXP_STATUS) {
      const code = pkt.readUInt32BE(5);
      if (code !== 0) {
        let msg = action;
        try {
          const [m] = this.readString(pkt, 9);
          msg = m || action;
        } catch {
          /* ignore */
        }
        throw new Error(`SFTP ${action} failed (code ${code}): ${msg}`);
      }
    }
  }

  async realpath(path: string): Promise<string> {
    await this.ready;
    const pkt = await this.sendRequest(SSH_FXP_REALPATH, this.writeString(path));
    if (pkt.readUInt8(0) !== SSH_FXP_NAME) {
      this.ensureStatusOk(pkt, 'realpath');
      throw new Error('SFTP realpath failed');
    }
    const count = pkt.readUInt32BE(5);
    if (count < 1) throw new Error('SFTP realpath empty');
    const [name] = this.readString(pkt, 9);
    return name;
  }

  async list(path: string): Promise<SftpEntry[]> {
    await this.ready;
    const openPkt = await this.sendRequest(SSH_FXP_OPENDIR, this.writeString(path));
    if (openPkt.readUInt8(0) !== SSH_FXP_HANDLE) {
      this.ensureStatusOk(openPkt, 'opendir');
      throw new Error('SFTP opendir failed');
    }
    const handleLen = openPkt.readUInt32BE(5);
    const handle = openPkt.subarray(9, 9 + handleLen);
    const handlePayload = Buffer.alloc(4 + handle.length);
    handlePayload.writeUInt32BE(handle.length, 0);
    handle.copy(handlePayload, 4);

    const entries: SftpEntry[] = [];
    try {
      while (true) {
        const pkt = await this.sendRequest(SSH_FXP_READDIR, handlePayload);
        const type = pkt.readUInt8(0);
        if (type === SSH_FXP_STATUS) {
          const code = pkt.readUInt32BE(5);
          if (code === 1) break; // SSH_FX_EOF
          this.ensureStatusOk(pkt, 'readdir');
          break;
        }
        if (type !== SSH_FXP_NAME) throw new Error('SFTP readdir unexpected');
        const count = pkt.readUInt32BE(5);
        let off = 9;
        for (let i = 0; i < count; i++) {
          let name: string;
          let longname: string;
          [name, off] = this.readString(pkt, off);
          [longname, off] = this.readString(pkt, off);
          const flags = pkt.readUInt32BE(off);
          off += 4;
          let size = 0;
          let permissions = 0;
          let mtime = 0;
          if (flags & SSH_FILEXFER_ATTR_SIZE) {
            // uint64
            const high = pkt.readUInt32BE(off);
            const low = pkt.readUInt32BE(off + 4);
            size = high * 0x100000000 + low;
            off += 8;
          }
          if (flags & 0x00000002) {
            // uid/gid
            off += 8;
          }
          if (flags & SSH_FILEXFER_ATTR_PERMISSIONS) {
            permissions = pkt.readUInt32BE(off);
            off += 4;
          }
          if (flags & SSH_FILEXFER_ATTR_ACMODTIME) {
            off += 4; // atime
            mtime = pkt.readUInt32BE(off);
            off += 4;
          }
          if (flags & 0x80000000) {
            // extended
            const extCount = pkt.readUInt32BE(off);
            off += 4;
            for (let e = 0; e < extCount; e++) {
              let _s: string;
              [_s, off] = this.readString(pkt, off);
              [_s, off] = this.readString(pkt, off);
            }
          }
          if (name === '.' || name === '..') continue;
          const isDir = (permissions & 0o40000) !== 0 || longname.startsWith('d');
          entries.push({ name, longname, isDir, size, permissions, mtime });
        }
      }
    } finally {
      await this.sendRequest(SSH_FXP_CLOSE, handlePayload).catch(() => {});
    }
    return entries.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async readFile(
    path: string,
    onProgress?: (n: number) => void
  ): Promise<Uint8Array> {
    await this.ready;
    const openFlags = SSH_FXF_READ;
    const payload = Buffer.concat([
      this.writeString(path),
      (() => {
        const b = Buffer.alloc(8);
        b.writeUInt32BE(openFlags, 0);
        b.writeUInt32BE(0, 4); // attr flags
        return b;
      })(),
    ]);
    const openPkt = await this.sendRequest(SSH_FXP_OPEN, payload);
    if (openPkt.readUInt8(0) !== SSH_FXP_HANDLE) {
      this.ensureStatusOk(openPkt, 'open');
      throw new Error('SFTP open failed');
    }
    const handleLen = openPkt.readUInt32BE(5);
    const handle = openPkt.subarray(9, 9 + handleLen);
    const handleStr = Buffer.alloc(4 + handle.length);
    handleStr.writeUInt32BE(handle.length, 0);
    handle.copy(handleStr, 4);

    const chunks: Buffer[] = [];
    let offset = 0;
    const chunkSize = 32 * 1024;
    try {
      while (true) {
        const req = Buffer.alloc(4 + handle.length + 8 + 4);
        let o = 0;
        req.writeUInt32BE(handle.length, o);
        o += 4;
        handle.copy(req, o);
        o += handle.length;
        // uint64 offset
        req.writeUInt32BE(Math.floor(offset / 0x100000000), o);
        req.writeUInt32BE(offset >>> 0, o + 4);
        o += 8;
        req.writeUInt32BE(chunkSize, o);
        const pkt = await this.sendRequest(SSH_FXP_READ, req);
        const type = pkt.readUInt8(0);
        if (type === SSH_FXP_STATUS) {
          const code = pkt.readUInt32BE(5);
          if (code === 1) break; // EOF
          this.ensureStatusOk(pkt, 'read');
          break;
        }
        if (type !== SSH_FXP_DATA) throw new Error('SFTP read unexpected');
        const dataLen = pkt.readUInt32BE(5);
        const data = pkt.subarray(9, 9 + dataLen);
        chunks.push(data);
        offset += data.length;
        onProgress?.(offset);
        if (data.length === 0) break;
      }
    } finally {
      await this.sendRequest(SSH_FXP_CLOSE, handleStr).catch(() => {});
    }
    return new Uint8Array(Buffer.concat(chunks));
  }

  async writeFile(
    path: string,
    data: Uint8Array,
    onProgress?: (n: number) => void
  ): Promise<void> {
    await this.ready;
    const openFlags = SSH_FXF_WRITE | SSH_FXF_CREAT | SSH_FXF_TRUNC;
    const payload = Buffer.concat([
      this.writeString(path),
      (() => {
        const b = Buffer.alloc(8);
        b.writeUInt32BE(openFlags, 0);
        b.writeUInt32BE(0, 4);
        return b;
      })(),
    ]);
    const openPkt = await this.sendRequest(SSH_FXP_OPEN, payload);
    if (openPkt.readUInt8(0) !== SSH_FXP_HANDLE) {
      this.ensureStatusOk(openPkt, 'open-write');
      throw new Error('SFTP open for write failed');
    }
    const handleLen = openPkt.readUInt32BE(5);
    const handle = openPkt.subarray(9, 9 + handleLen);
    const handleStr = Buffer.alloc(4 + handle.length);
    handleStr.writeUInt32BE(handle.length, 0);
    handle.copy(handleStr, 4);

    const chunkSize = 32 * 1024;
    let offset = 0;
    try {
      while (offset < data.length) {
        const end = Math.min(offset + chunkSize, data.length);
        const slice = data.subarray(offset, end);
        const req = Buffer.alloc(4 + handle.length + 8 + 4 + slice.length);
        let o = 0;
        req.writeUInt32BE(handle.length, o);
        o += 4;
        handle.copy(req, o);
        o += handle.length;
        req.writeUInt32BE(Math.floor(offset / 0x100000000), o);
        req.writeUInt32BE(offset >>> 0, o + 4);
        o += 8;
        req.writeUInt32BE(slice.length, o);
        o += 4;
        req.set(slice, o);
        const pkt = await this.sendRequest(SSH_FXP_WRITE, req);
        this.ensureStatusOk(pkt, 'write');
        offset = end;
        onProgress?.(offset);
      }
    } finally {
      await this.sendRequest(SSH_FXP_CLOSE, handleStr).catch(() => {});
    }
  }

  async remove(path: string): Promise<void> {
    await this.ready;
    const pkt = await this.sendRequest(SSH_FXP_REMOVE, this.writeString(path));
    this.ensureStatusOk(pkt, 'remove');
  }

  async mkdir(path: string): Promise<void> {
    await this.ready;
    const payload = Buffer.concat([this.writeString(path), Buffer.alloc(4)]); // empty attrs
    const pkt = await this.sendRequest(SSH_FXP_MKDIR, payload);
    this.ensureStatusOk(pkt, 'mkdir');
  }

  async rmdir(path: string): Promise<void> {
    await this.ready;
    const pkt = await this.sendRequest(SSH_FXP_RMDIR, this.writeString(path));
    this.ensureStatusOk(pkt, 'rmdir');
  }

  async close(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.dataDisposable.dispose();
    for (const [, p] of this.pending) {
      p.reject(new Error('SFTP closed'));
    }
    this.pending.clear();
    await this.channel.close().catch(() => {});
  }
}
