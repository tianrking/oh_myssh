/**
 * Adapt browser Web Streams / WebSocket into Microsoft SSH Stream interface.
 */
import { Buffer } from 'buffer';
import { BaseStream, WebSocketStream, type Stream } from '@microsoft/dev-tunnels-ssh';
import type { DuplexByteStream } from '../socket/transport';

/**
 * Wrap a ReadableStream/WritableStream pair as an SSH Stream.
 */
export class WebStreamsSshAdapter extends BaseStream {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private pumpPromise: Promise<void>;
  private duplexClose: () => Promise<void>;

  constructor(duplex: DuplexByteStream) {
    super();
    this.reader = duplex.readable.getReader();
    this.writer = duplex.writable.getWriter();
    this.duplexClose = () => duplex.close();
    this.pumpPromise = this.pump();
  }

  private async pump() {
    try {
      while (!this.isDisposed) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.onEnd();
          break;
        }
        if (value && value.byteLength > 0) {
          this.onData(Buffer.from(value));
        }
      }
    } catch (err) {
      this.onError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async write(data: Buffer): Promise<void> {
    if (this.isDisposed) throw new Error('Stream disposed');
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    await this.writer.write(copy);
  }

  async close(error?: Error): Promise<void> {
    try {
      await this.writer.close().catch(() => {});
      await this.reader.cancel().catch(() => {});
      await this.duplexClose().catch(() => {});
    } finally {
      this.fireOnClose(error);
      this.dispose();
    }
  }
}

/** Open a WebSocket and return an SSH WebSocketStream. */
export async function openWebSocketSshStream(url: string, timeoutMs = 15000): Promise<Stream> {
  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`WebSocket timeout: ${url}`));
    }, timeoutMs);

    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`WebSocket failed: ${url}`));
    };
  });

  return new WebSocketStream(ws);
}

/** Build same-origin Vite relay URL for raw TCP. */
export function buildLocalRelayUrl(host: string, port: number): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${proto}//${window.location.host}/__ohmyssh_tcp`;
  return `${base}?host=${encodeURIComponent(host)}&port=${port}`;
}

/** Build custom relay URL with host/port query. */
export function buildRelayUrl(relayBase: string, host: string, port: number): string {
  try {
    const u = new URL(relayBase, window.location.href);
    u.searchParams.set('host', host);
    u.searchParams.set('port', String(port));
    // Convert http(s) → ws(s) if needed
    if (u.protocol === 'http:') u.protocol = 'ws:';
    if (u.protocol === 'https:') u.protocol = 'wss:';
    return u.toString();
  } catch {
    const join = relayBase.includes('?') ? '&' : '?';
    return `${relayBase}${join}host=${encodeURIComponent(host)}&port=${port}`;
  }
}
