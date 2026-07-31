import { connect } from 'cloudflare:sockets';
import { constantTimeTokenEqual, parsePositiveInt, sha256Base64Url } from './security';
import type { GatewayEnv, SessionRecord } from './types';

const SESSION_KEY = 'session';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class RelaySession {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: GatewayEnv,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/init' && request.method === 'POST') return this.initialize(request);
    if (url.pathname === '/connect' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      return this.connect(request);
    }
    return new Response('Not found', { status: 404 });
  }

  private async initialize(request: Request): Promise<Response> {
    const record = await request.json<SessionRecord>();
    if (
      !record.initialized ||
      record.used ||
      !/^[a-f0-9]{64}$/u.test(record.sessionId) ||
      !record.ticketHash ||
      !record.address ||
      !record.host ||
      !Number.isSafeInteger(record.port)
    ) {
      return new Response('Invalid session record', { status: 400 });
    }
    let created = false;
    await this.state.storage.transaction(async (txn) => {
      if (await txn.get(SESSION_KEY)) return;
      await txn.put(SESSION_KEY, record);
      created = true;
    });
    return Response.json({ ok: created }, { status: created ? 201 : 409 });
  }

  private async connect(request: Request): Promise<Response> {
    const ticket = request.headers.get('x-ohmyssh-ticket') || '';
    const ticketHash = await sha256Base64Url(ticket);
    let record: SessionRecord | undefined;
    let consumed = false;
    await this.state.storage.transaction(async (txn) => {
      const candidate = await txn.get<SessionRecord>(SESSION_KEY);
      if (!candidate || candidate.used || candidate.expiresAt <= Date.now()) return;
      if (!(await constantTimeTokenEqual(ticketHash, candidate.ticketHash))) return;
      candidate.used = true;
      await txn.put(SESSION_KEY, candidate);
      record = candidate;
      consumed = true;
    });
    if (!consumed || !record) return new Response('Invalid, expired, or used ticket', { status: 401 });

    const connectTimeoutMs = parsePositiveInt(this.env.CONNECT_TIMEOUT_MS, 10_000, 1_000, 30_000);
    const socket = connect(
      { hostname: record.address, port: record.port },
      { secureTransport: 'off', allowHalfOpen: false },
    );
    let connectTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        socket.opened,
        new Promise<never>((_, reject) => {
          connectTimer = setTimeout(() => reject(new Error('TCP connection timed out')), connectTimeoutMs);
        }),
      ]);
    } catch (error) {
      await socket.close().catch(() => undefined);
      await this.release(record);
      return Response.json({ error: 'Target connection failed', detail: errorMessage(error) }, { status: 502 });
    } finally {
      if (connectTimer) clearTimeout(connectTimer);
    }

    const maxSessionSeconds = parsePositiveInt(this.env.MAX_SESSION_SECONDS, 14_400, 60, 86_400);
    const activated = await this.rateRequest(record, '/activate', {
      expiresAt: Date.now() + maxSessionSeconds * 1000,
    });
    if (!activated.ok) {
      await socket.close().catch(() => undefined);
      await this.release(record);
      return new Response('Session lease expired', { status: 429 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();
    this.state.waitUntil(this.bridge(server, socket, record));

    return new Response(null, {
      status: 101,
      webSocket: client,
      headers: {
        'Sec-WebSocket-Protocol': 'ohmyssh.v1',
        'Cache-Control': 'no-store',
      },
    });
  }

  private async bridge(
    webSocket: WebSocket,
    socket: ReturnType<typeof connect>,
    record: SessionRecord,
  ): Promise<void> {
    const idleTimeoutMs = parsePositiveInt(this.env.IDLE_TIMEOUT_SECONDS, 900, 30, 7_200) * 1000;
    const maxSessionMs = parsePositiveInt(this.env.MAX_SESSION_SECONDS, 14_400, 60, 86_400) * 1000;
    const maxBytes = parsePositiveInt(
      this.env.MAX_BYTES_PER_DIRECTION,
      1_073_741_824,
      1_048_576,
      8_589_934_592,
    );
    const maxFrameBytes = parsePositiveInt(this.env.MAX_FRAME_BYTES, 262_144, 1_024, 1_048_576);
    const maxQueuedBytes = parsePositiveInt(this.env.MAX_QUEUED_BYTES, 1_048_576, 65_536, 8_388_608);
    const startedAt = Date.now();
    let lastActivity = startedAt;
    let clientBytes = 0;
    let remoteBytes = 0;
    let queuedBytes = 0;
    let unackedBytes = 0;
    let closed = false;
    let writeTail = Promise.resolve();
    const creditWaiters = new Set<() => void>();
    const writer = socket.writable.getWriter();
    const reader = socket.readable.getReader();

    const wakeCredit = () => {
      for (const resolve of creditWaiters) resolve();
      creditWaiters.clear();
    };
    const waitForCredit = () =>
      new Promise<void>((resolve, reject) => {
        let timer: ReturnType<typeof setTimeout>;
        const release = () => {
          clearTimeout(timer);
          creditWaiters.delete(release);
          resolve();
        };
        creditWaiters.add(release);
        timer = setTimeout(() => {
          creditWaiters.delete(release);
          reject(new Error('Browser receive acknowledgement timed out'));
        }, 30_000);
      });
    const sendControl = (message: object) => {
      if (!closed) webSocket.send(JSON.stringify(message));
    };
    const shutdown = async (code = 1000, reason = 'closed') => {
      if (closed) return;
      closed = true;
      wakeCredit();
      clearInterval(watchdog);
      try {
        webSocket.close(code, reason.slice(0, 120));
      } catch {
        // already closed
      }
      await reader.cancel().catch(() => undefined);
      await writer.abort(reason).catch(() => undefined);
      await socket.close().catch(() => undefined);
      await this.release(record);
    };

    webSocket.addEventListener('message', (event) => {
      lastActivity = Date.now();
      if (typeof event.data === 'string') {
        if (event.data.length > 1024) {
          void shutdown(1009, 'Control frame is too large');
          return;
        }
        try {
          const control = JSON.parse(event.data) as { type?: string; bytes?: number };
          if (control.type === 'ack') {
            if (
              !Number.isSafeInteger(control.bytes) ||
              control.bytes! <= 0 ||
              control.bytes! > unackedBytes
            ) {
              void shutdown(1003, 'Invalid acknowledgement');
              return;
            }
            unackedBytes -= control.bytes!;
            wakeCredit();
            return;
          }
          if (control.type === 'ping') {
            sendControl({ type: 'pong', now: Date.now() });
            return;
          }
        } catch {
          // handled below as a protocol violation
        }
        void shutdown(1003, 'Invalid control frame');
        return;
      }

      const bytes = event.data instanceof ArrayBuffer
        ? new Uint8Array(event.data)
        : ArrayBuffer.isView(event.data)
          ? new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
          : null;
      if (!bytes || bytes.byteLength === 0 || bytes.byteLength > maxFrameBytes) {
        void shutdown(1009, 'Invalid frame size');
        return;
      }
      if (queuedBytes + bytes.byteLength > maxQueuedBytes) {
        void shutdown(1013, 'Relay input queue exceeded');
        return;
      }
      clientBytes += bytes.byteLength;
      if (clientBytes > maxBytes) {
        void shutdown(1009, 'Client byte limit exceeded');
        return;
      }
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      queuedBytes += copy.byteLength;
      writeTail = writeTail
        .then(() => writer.write(copy))
        .catch((error) => shutdown(1011, errorMessage(error)))
        .finally(() => {
          queuedBytes -= copy.byteLength;
        });
    });
    webSocket.addEventListener('close', () => void shutdown());
    webSocket.addEventListener('error', () => void shutdown(1011, 'WebSocket transport error'));

    const watchdog = setInterval(() => {
      const now = Date.now();
      if (now - lastActivity > idleTimeoutMs) void shutdown(1000, 'Idle timeout');
      else if (now - startedAt > maxSessionMs) void shutdown(1000, 'Maximum session duration reached');
    }, 15_000);

    sendControl({
      type: 'ready',
      protocol: 'ohmyssh.v1',
      target: `${record.host}:${record.port}`,
      addressFamily: record.family,
    });

    try {
      while (!closed) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;
        lastActivity = Date.now();
        remoteBytes += value.byteLength;
        if (remoteBytes > maxBytes) throw new Error('Remote byte limit exceeded');
        for (let offset = 0; offset < value.byteLength && !closed; offset += maxFrameBytes) {
          while (unackedBytes >= maxQueuedBytes && !closed) await waitForCredit();
          const chunk = value.slice(offset, Math.min(value.byteLength, offset + maxFrameBytes));
          unackedBytes += chunk.byteLength;
          webSocket.send(chunk);
        }
      }
      await writeTail;
      await shutdown(1000, 'Remote closed');
    } catch (error) {
      sendControl({ type: 'error', code: 'relay_failed', message: errorMessage(error).slice(0, 180) });
      await shutdown(1011, 'Relay failed');
    }
  }

  private async rateRequest(
    record: SessionRecord,
    path: '/activate' | '/release',
    extra: Record<string, unknown> = {},
  ): Promise<Response> {
    const id = this.env.RATE_LIMITS.idFromString(record.limiterId);
    return this.env.RATE_LIMITS.get(id).fetch(`https://rate.internal${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: record.sessionId, ...extra }),
    });
  }

  private async release(record: SessionRecord): Promise<void> {
    await this.rateRequest(record, '/release').catch(() => undefined);
    await this.state.storage.deleteAll().catch(() => undefined);
  }
}
