/**
 * Dev/preview WebSocket → raw TCP relay.
 * Pure static frontend has no TCP; this optional Vite middleware
 * lets the browser exercise real SSH during npm run dev / preview.
 *
 * Path: /__ohmyssh_tcp?host=example.com&port=22
 * Protocol: binary frames, 1:1 with TCP bytes (no extra framing).
 */
import type { Plugin, PreviewServer, ViteDevServer } from 'vite';
import { WebSocketServer, type WebSocket } from 'ws';
import net from 'node:net';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

const PATH = '/__ohmyssh_tcp';
const MAX_FRAME_BYTES = 256 * 1024;
const MAX_BUFFERED_BYTES = 1024 * 1024;

export function isAllowedRelayOrigin(origin: string | undefined, hostHeader: string): boolean {
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return ['http:', 'https:'].includes(parsed.protocol) && parsed.host === hostHeader;
  } catch {
    return false;
  }
}

export function parseRelayTarget(
  requestUrl: string,
  hostHeader: string,
): { host: string; port: number } | null {
  const url = new URL(requestUrl, `http://${hostHeader}`);
  if (url.pathname !== PATH) return null;
  const host = (url.searchParams.get('host') || '').trim();
  const rawPort = url.searchParams.get('port') || '22';
  if (
    !host ||
    host.length > 253 ||
    /[\s/@?#]/u.test(host) ||
    !/^\d{1,5}$/u.test(rawPort)
  ) {
    throw new Error('Invalid relay target');
  }
  const port = Number(rawPort);
  if (port < 1 || port > 65535) throw new Error('Invalid relay target');
  return { host, port };
}

function attachRelay(httpServer: NonNullable<ViteDevServer['httpServer']>) {
  const wss = new WebSocketServer({
    noServer: true,
    perMessageDeflate: false,
    maxPayload: MAX_FRAME_BYTES,
  });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const hostHeader = req.headers.host || 'localhost';
      const target = parseRelayTarget(req.url || '/', hostHeader);
      if (!target) return;
      // Prevent unrelated websites from using a developer's localhost Vite server
      // as a private-network TCP pivot.
      if (!isAllowedRelayOrigin(req.headers.origin, hostHeader)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        pipeWsToTcp(ws, target.host, target.port);
      });
    } catch {
      try {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
      } catch {
        /* ignore */
      }
    }
  };

  httpServer.on('upgrade', onUpgrade);

  return () => {
    httpServer.off('upgrade', onUpgrade);
    wss.close();
  };
}

function pipeWsToTcp(ws: WebSocket, host: string, port: number) {
  const tcp = net.connect({ host, port, noDelay: true });
  let closed = false;
  const connectTimer = setTimeout(() => shutdown(new Error('TCP connect timeout')), 10_000);

  const shutdown = (err?: Error) => {
    if (closed) return;
    closed = true;
    clearTimeout(connectTimer);
    try {
      tcp.destroy(err);
    } catch {
      /* ignore */
    }
    try {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.close(err ? 1011 : 1000, err?.message?.slice(0, 120));
      }
    } catch {
      /* ignore */
    }
  };

  tcp.on('connect', () => {
    clearTimeout(connectTimer);
  });

  tcp.on('data', (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) {
      if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
        shutdown(new Error('WebSocket output buffer exceeded'));
        return;
      }
      ws.send(chunk, { binary: true }, (error) => {
        if (error) shutdown(error);
      });
    }
  });

  tcp.on('error', (err) => shutdown(err));
  tcp.on('close', () => shutdown());

  ws.on('message', (data, isBinary) => {
    if (tcp.destroyed) return;
    if (!isBinary) {
      shutdown(new Error('Binary frames required'));
      return;
    }
    const buf = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);
    if (buf.byteLength === 0 || buf.byteLength > MAX_FRAME_BYTES) {
      shutdown(new Error('Invalid relay frame size'));
      return;
    }
    if (tcp.writableLength + buf.byteLength > MAX_BUFFERED_BYTES) {
      shutdown(new Error('TCP output buffer exceeded'));
      return;
    }
    tcp.write(buf);
  });

  ws.on('error', (err) => shutdown(err));
  ws.on('close', () => shutdown());
}

export function createWsTcpRelayPlugin(): Plugin {
  let dispose: (() => void) | undefined;

  return {
    name: 'ohmyssh-ws-tcp-relay',
    configureServer(server) {
      if (server.httpServer) {
        dispose = attachRelay(server.httpServer);
      }
    },
    configurePreviewServer(server: PreviewServer) {
      if (server.httpServer) {
        dispose = attachRelay(server.httpServer);
      }
    },
    closeBundle() {
      dispose?.();
    },
  };
}

export const SSH_TCP_RELAY_PATH = PATH;
