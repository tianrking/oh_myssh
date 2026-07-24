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

function attachRelay(httpServer: NonNullable<ViteDevServer['httpServer']>) {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const hostHeader = req.headers.host || 'localhost';
      const url = new URL(req.url || '/', `http://${hostHeader}`);
      if (url.pathname !== PATH) return;

      const targetHost = url.searchParams.get('host') || '';
      const targetPort = parseInt(url.searchParams.get('port') || '22', 10);

      if (!targetHost || !Number.isFinite(targetPort) || targetPort < 1 || targetPort > 65535) {
        socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }

      // Basic SSRF guard: block obviously local-only targets in production-like envs if needed.
      // Dev tool is intentional for connecting to user-chosen hosts including private LAN.
      wss.handleUpgrade(req, socket, head, (ws) => {
        pipeWsToTcp(ws, targetHost, targetPort);
      });
    } catch {
      try {
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

  const shutdown = (err?: Error) => {
    if (closed) return;
    closed = true;
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
    // ready
  });

  tcp.on('data', (chunk: Buffer) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(chunk, { binary: true });
    }
  });

  tcp.on('error', (err) => shutdown(err));
  tcp.on('close', () => shutdown());

  ws.on('message', (data, isBinary) => {
    if (tcp.destroyed) return;
    const buf = Buffer.isBuffer(data)
      ? data
      : Buffer.from(data as ArrayBuffer);
    if (!isBinary && typeof data === 'string') {
      tcp.write(Buffer.from(data));
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
