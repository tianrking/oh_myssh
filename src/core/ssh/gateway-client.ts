/**
 * Browser → WebSSH Gateway client
 * Default product path: open webpage, gateway dials real SSH (like classic WebSSH).
 */
import type { DuplexByteStream } from '../socket/transport';

export type GatewayConnectParams = {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
  cols?: number;
  rows?: number;
  /** Override gateway WebSocket URL */
  gatewayUrl?: string;
  onStatus?: (msg: string) => void;
};

export type GatewaySession = {
  mode: 'webssh-gateway';
  stream: DuplexByteStream;
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<void>;
};

/**
 * Resolve WebSocket URL for the WebSSH gateway.
 * Same-origin by default so end users only open the website — zero local install.
 *
 * - Production all-in-one (`npm start`):  /ssh  and /ssh-ws
 * - Vite dev (`npm run dev`):            /ssh-ws proxied to local gateway
 * - Override: VITE_SSH_GATEWAY or explicit argument
 */
export function resolveGatewayWsUrl(override?: string): string {
  if (override && override.trim()) {
    return override.trim();
  }
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    if (env?.VITE_SSH_GATEWAY) {
      return env.VITE_SSH_GATEWAY;
    }
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined') {
    return 'ws://127.0.0.1:3922/ssh';
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  // Prefer /ssh-ws (works in dev proxy + prod all-in-one)
  return `${proto}//${window.location.host}/ssh-ws`;
}

/**
 * Probe whether the WebSSH gateway is reachable (best-effort).
 */
export async function probeGateway(gatewayUrl?: string, timeoutMs = 2500): Promise<boolean> {
  const url = resolveGatewayWsUrl(gatewayUrl);
  return new Promise((resolve) => {
    let settled = false;
    const ws = new WebSocket(url);
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        resolve(false);
      }
    }, timeoutMs);
    ws.onopen = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        ws.close();
        resolve(true);
      }
    };
    ws.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
  });
}

/**
 * Connect to a remote SSH host via the WebSSH gateway.
 * Returns a duplex stream suitable for TerminalEngine.attachStream.
 */
export async function connectViaWebSshGateway(
  params: GatewayConnectParams
): Promise<GatewaySession> {
  const url = resolveGatewayWsUrl(params.gatewayUrl);
  params.onStatus?.(`Connecting gateway ${url}…`);

  const ws = new WebSocket(url);
  ws.binaryType = 'arraybuffer';

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(
        new Error(
          `无法连接 WebSSH 网关 (${url})。请确认已启动：npm run gateway 或 npm run dev`
        )
      );
    }, 12000);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve();
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`WebSSH 网关连接失败: ${url}`));
    };
  });

  params.onStatus?.(
    `Gateway open · dialing ${params.username}@${params.host}:${params.port}…`
  );

  // Wait for ready / error
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('SSH 网关握手超时'));
    }, 25000);

    const onMessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'status') {
          params.onStatus?.(msg.status + (msg.target ? ` ${msg.target}` : ''));
          return;
        }
        if (msg.type === 'ready') {
          clearTimeout(timer);
          ws.removeEventListener('message', onMessage);
          resolve();
          return;
        }
        if (msg.type === 'error') {
          clearTimeout(timer);
          ws.removeEventListener('message', onMessage);
          reject(new Error(msg.message || 'SSH gateway error'));
        }
      } catch {
        /* ignore */
      }
    };

    ws.addEventListener('message', onMessage);
    ws.send(
      JSON.stringify({
        type: 'connect',
        host: params.host,
        port: params.port,
        username: params.username,
        password: params.password,
        privateKey: params.privateKey,
        cols: params.cols ?? 120,
        rows: params.rows ?? 40,
      })
    );
  });

  params.onStatus?.('SSH ready');

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            if (msg.type === 'error') {
              c.error(new Error(msg.message || 'gateway error'));
            }
            if (msg.type === 'closed') {
              try {
                c.close();
              } catch {
                /* ignore */
              }
            }
          } catch {
            // text as terminal data
            c.enqueue(new TextEncoder().encode(ev.data));
          }
          return;
        }
        const buf =
          ev.data instanceof ArrayBuffer
            ? new Uint8Array(ev.data)
            : new Uint8Array(ev.data as ArrayBuffer);
        c.enqueue(buf);
      };
      ws.onclose = () => {
        closed = true;
        try {
          c.close();
        } catch {
          /* ignore */
        }
      };
      ws.onerror = () => {
        try {
          c.error(new Error('WebSocket error'));
        } catch {
          /* ignore */
        }
      };
    },
    cancel() {
      closed = true;
      ws.close();
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      if (closed || ws.readyState !== WebSocket.OPEN) return;
      ws.send(chunk);
    },
    close() {
      ws.close();
    },
  });

  const stream: DuplexByteStream = {
    readable,
    writable,
    close: async () => {
      closed = true;
      try {
        controller?.close();
      } catch {
        /* ignore */
      }
      ws.close();
    },
  };

  return {
    mode: 'webssh-gateway',
    stream,
    write: (data) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      if (typeof data === 'string') ws.send(new TextEncoder().encode(data));
      else ws.send(data);
    },
    resize: (cols, rows) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    },
    close: () => stream.close(),
  };
}
