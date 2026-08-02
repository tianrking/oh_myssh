/**
 * Adapt browser Web Streams / WebSocket into the Microsoft SSH Stream interface.
 *
 * The production relay transports encrypted SSH bytes only. A short-lived ticket is
 * requested over HTTPS and carried in the WebSocket subprotocol header, never in the URL.
 */
import { Buffer } from 'buffer';
import { BaseStream, type Stream } from '@microsoft/dev-tunnels-ssh';
import type { DuplexByteStream } from '../socket/transport';

export type RelayEndpointConfig = {
  url: string;
  accessToken: string;
};

type RelayTicket = {
  protocol: 'ohmyssh.v1';
  sessionId: string;
  ticket: string;
  expiresAt: number;
};

/** Wrap a ReadableStream/WritableStream pair as an SSH Stream. */
export class WebStreamsSshAdapter extends BaseStream {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private writer: WritableStreamDefaultWriter<Uint8Array>;
  private duplexClose: () => Promise<void>;

  constructor(duplex: DuplexByteStream) {
    super();
    this.reader = duplex.readable.getReader();
    this.writer = duplex.writable.getWriter();
    this.duplexClose = () => duplex.close();
    void this.pump();
  }

  private async pump() {
    try {
      while (!this.isDisposed) {
        const { value, done } = await this.reader.read();
        if (done) {
          this.onEnd();
          break;
        }
        if (value?.byteLength) this.onData(Buffer.from(value));
      }
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async write(data: Buffer): Promise<void> {
    if (this.isDisposed) throw new Error('Stream disposed');
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    await this.writer.write(copy);
  }

  async close(error?: Error): Promise<void> {
    if (this.isDisposed) return;
    this.disposed = true;
    try {
      await this.writer.close().catch(() => undefined);
      await this.reader.cancel().catch(() => undefined);
      await this.duplexClose().catch(() => undefined);
    } finally {
      if (error) this.onError(error);
      else this.onEnd();
      this.fireOnClose(error);
    }
  }
}

class RelayWebSocketStream extends BaseStream {
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  readonly relayReady: Promise<void>;

  constructor(
    private readonly websocket: WebSocket,
    private readonly flowControl: boolean,
    expectReady: boolean,
  ) {
    super();
    this.relayReady = expectReady
      ? new Promise<void>((resolve, reject) => {
          this.readyResolve = resolve;
          this.readyReject = reject;
        })
      : Promise.resolve();

    websocket.binaryType = 'arraybuffer';
    websocket.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const control = JSON.parse(event.data) as {
            type?: string;
            message?: string;
            code?: string;
          };
          if (control.type === 'ready') {
            this.readyResolve?.();
            return;
          }
          if (control.type === 'error') {
            const error = new Error(control.message || control.code || 'Relay failed');
            this.readyReject?.(error);
            this.onError(error);
            return;
          }
          if (control.type === 'pong') return;
        } catch {
          // Control frames are never SSH payload.
        }
        return;
      }

      const bytes = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : new Uint8Array(0);
      if (!bytes.byteLength) return;
      this.onData(Buffer.from(bytes));
      if (flowControl && websocket.readyState === WebSocket.OPEN) {
        websocket.send(JSON.stringify({ type: 'ack', bytes: bytes.byteLength }));
      }
    };
    websocket.onclose = (event) => {
      if (this.isDisposed) return;
      const error = event.wasClean ? undefined : new Error(event.reason || `Relay closed (${event.code})`);
      if (error) {
        this.readyReject?.(error);
        this.onError(error);
      } else {
        this.onEnd();
      }
    };
    websocket.onerror = () => {
      if (this.isDisposed) return;
      const error = new Error('WebSocket transport error');
      this.readyReject?.(error);
      this.onError(error);
    };
  }

  async write(data: Buffer): Promise<void> {
    if (!data) throw new TypeError('Data is required');
    if (this.isDisposed) throw new Error('Relay stream is closed');
    const deadline = Date.now() + 15_000;
    while (this.websocket.bufferedAmount > 1_048_576) {
      if (Date.now() >= deadline) throw new Error('Relay send buffer remained full');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    if (this.websocket.readyState !== WebSocket.OPEN) throw new Error('Relay WebSocket is not open');
    this.websocket.send(data);
  }

  async close(error?: Error): Promise<void> {
    if (this.isDisposed) return;
    this.disposed = true;
    this.websocket.close(error ? 1011 : 1000, error?.message.slice(0, 120));
    if (error) this.onError(error);
    else this.onEnd();
    this.fireOnClose(error);
  }

  dispose(): void {
    if (!this.isDisposed) this.websocket.close(1000, 'disposed');
    super.dispose();
  }
}

export function relayEndpointUrls(input: string): { ticketUrl: string; webSocketUrl: string } {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new Error('Relay URL must be an absolute http(s) or ws(s) URL');
  }
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(parsed.protocol)) {
    throw new Error('Relay URL must use HTTPS/WSS (or HTTP/WS for local development)');
  }
  if (parsed.username || parsed.password || parsed.hash || parsed.search) {
    throw new Error('Relay URL must not contain credentials, query parameters, or a fragment');
  }
  const secure = parsed.protocol === 'https:' || parsed.protocol === 'wss:';
  const isLoopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if (!secure && !isLoopback) {
    throw new Error('Relay URL must use HTTPS/WSS outside local development');
  }
  const prefix = parsed.pathname
    .replace(/\/api\/(?:ticket|tcp)\/?$/u, '')
    .replace(/\/$/u, '');
  const httpProtocol = secure ? 'https:' : 'http:';
  const wsProtocol = secure ? 'wss:' : 'ws:';
  return {
    ticketUrl: `${httpProtocol}//${parsed.host}${prefix}/api/ticket`,
    webSocketUrl: `${wsProtocol}//${parsed.host}${prefix}/api/tcp`,
  };
}

async function requestRelayTicket(
  endpoint: RelayEndpointConfig,
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ ticket: RelayTicket; webSocketUrl: string }> {
  const urls = relayEndpointUrls(endpoint.url.trim());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (endpoint.accessToken.trim()) headers.set('Authorization', `Bearer ${endpoint.accessToken.trim()}`);
    const response = await fetch(urls.ticketUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ host, port }),
      cache: 'no-store',
      credentials: 'include',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({})) as Partial<RelayTicket> & { error?: string };
    if (!response.ok) throw new Error(body.error || `Relay ticket failed (${response.status})`);
    if (
      body.protocol !== 'ohmyssh.v1' ||
      !body.sessionId?.match(/^[a-f0-9]{64}$/u) ||
      !body.ticket?.match(/^[A-Za-z0-9_-]{40,128}$/u) ||
      !Number.isFinite(body.expiresAt)
    ) {
      throw new Error('Relay returned an invalid ticket response');
    }
    return { ticket: body as RelayTicket, webSocketUrl: urls.webSocketUrl };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Relay ticket request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForOpen(websocket: WebSocket, timeoutMs: number): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      websocket.close();
      reject(new Error('Relay WebSocket connection timed out'));
    }, timeoutMs);
    websocket.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    websocket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('Relay WebSocket connection failed'));
    }, { once: true });
  });
}

export async function openTicketedRelaySshStream(
  endpoint: RelayEndpointConfig,
  host: string,
  port: number,
  timeoutMs = 15_000,
): Promise<Stream> {
  const { ticket, webSocketUrl } = await requestRelayTicket(endpoint, host, port, timeoutMs);
  const url = new URL(webSocketUrl);
  url.searchParams.set('session', ticket.sessionId);
  const websocket = new WebSocket(url, ['ohmyssh.v1', `ticket.${ticket.ticket}`]);
  const stream = new RelayWebSocketStream(websocket, true, true);
  await Promise.all([
    waitForOpen(websocket, timeoutMs),
    Promise.race([
      stream.relayReady,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Relay TCP setup timed out')), timeoutMs)),
    ]),
  ]).catch(async (error) => {
    await stream.close(error instanceof Error ? error : new Error(String(error)));
    throw error;
  });
  return stream;
}

/** Open a local-development raw WebSocket relay. */
export async function openWebSocketSshStream(url: string, timeoutMs = 15_000): Promise<Stream> {
  const websocket = new WebSocket(url);
  const stream = new RelayWebSocketStream(websocket, false, false);
  await waitForOpen(websocket, timeoutMs).catch(async (error) => {
    await stream.close(error instanceof Error ? error : new Error(String(error)));
    throw error;
  });
  return stream;
}

/** Build the Vite-only same-origin raw TCP relay URL. */
export function buildLocalRelayUrl(host: string, port: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const base = `${protocol}//${window.location.host}/__ohmyssh_tcp`;
  return `${base}?host=${encodeURIComponent(host)}&port=${port}`;
}

export function isLocalDevelopmentOrigin(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}
