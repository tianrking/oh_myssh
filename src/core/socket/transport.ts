/**
 * Oh My SSH - Socket Transport Abstraction Layer
 * Isolates Chromium Direct Sockets (IWA), WebSocket Relay, and Offline Shell.
 */

import { OfflineShellEngine } from '../shell/offline';

export type SocketCapabilities = {
  directTcp: boolean;
  tcpListen: boolean;
  udp: boolean;
  portForwarding: boolean;
  privateNetwork: boolean;
};

export interface DuplexByteStream {
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  close(): Promise<void>;
}

export interface SocketTransport {
  readonly name: string;
  probe(): Promise<SocketCapabilities>;
  connect(host: string, port: number, username?: string): Promise<DuplexByteStream>;
}

export type ConnectionMode = 'direct' | 'relay' | 'offline';

export function hasDirectSockets(): boolean {
  return typeof window !== 'undefined' && 'TCPSocket' in window;
}

/**
 * Resolve the best available connection path.
 * Offline shell is always available as a zero-config fallback.
 */
export function resolveConnectionMode(relayUrl?: string): ConnectionMode {
  if (hasDirectSockets()) return 'direct';
  if (relayUrl && relayUrl.trim().length > 0) return 'relay';
  return 'offline';
}

/**
 * Chromium Direct Sockets Transport (IWA)
 */
export class DirectSocketsTransport implements SocketTransport {
  readonly name = 'Direct Sockets (Chromium IWA)';

  async probe(): Promise<SocketCapabilities> {
    const ok = hasDirectSockets();
    return {
      directTcp: ok,
      tcpListen: false,
      udp: typeof window !== 'undefined' && 'UDPSocket' in window,
      portForwarding: ok,
      privateNetwork: true,
    };
  }

  async connect(host: string, port: number): Promise<DuplexByteStream> {
    if (!hasDirectSockets()) {
      throw new Error(
        '当前浏览器不支持 Chromium Direct Sockets (TCPSocket)。请使用 IWA 或配置 WebSocket Relay。'
      );
    }

    // @ts-expect-error Direct Sockets API is experimental
    const socket = new window.TCPSocket(host, port, {
      noDelay: true,
      keepAlive: true,
    });

    const info = await socket.opened;
    return {
      readable: info.readable,
      writable: info.writable,
      close: async () => {
        await socket.close();
      },
    };
  }
}

/**
 * WebSocket Relay Transport (self-hosted SSH WebSocket gateway)
 */
export class WebSocketRelayTransport implements SocketTransport {
  readonly name = 'WebSocket Relay';
  private relayUrl: string;

  constructor(relayUrl: string = 'wss://relay.ohmyssh.local/ssh') {
    this.relayUrl = relayUrl;
  }

  async probe(): Promise<SocketCapabilities> {
    return {
      directTcp: false,
      tcpListen: false,
      udp: false,
      portForwarding: false,
      privateNetwork: false,
    };
  }

  async connect(host: string, port: number): Promise<DuplexByteStream> {
    const targetUrl = `${this.relayUrl}?host=${encodeURIComponent(host)}&port=${port}`;
    const ws = new WebSocket(targetUrl);
    ws.binaryType = 'arraybuffer';

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`WebSocket Relay 连接超时: ${this.relayUrl}`));
      }, 12000);

      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket Relay 连接失败: ${this.relayUrl}`));
      };
    });

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            controller.enqueue(new Uint8Array(event.data));
          } else if (typeof event.data === 'string') {
            controller.enqueue(new TextEncoder().encode(event.data));
          }
        };
        ws.onclose = () => {
          try {
            controller.close();
          } catch {
            /* closed */
          }
        };
        ws.onerror = () => {
          try {
            controller.error(new Error('WebSocket error'));
          } catch {
            /* closed */
          }
        };
      },
      cancel() {
        ws.close();
      },
    });

    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(chunk);
        }
      },
      close() {
        ws.close();
      },
    });

    return {
      readable,
      writable,
      close: async () => {
        ws.close();
      },
    };
  }
}

/**
 * Offline Interactive Shell Transport — always works, zero network.
 * Full virtual FS + readline for pure web offline development.
 */
export class MockSocketTransport implements SocketTransport {
  readonly name = 'Offline Interactive Shell';

  async probe(): Promise<SocketCapabilities> {
    return {
      directTcp: false,
      tcpListen: false,
      udp: false,
      portForwarding: false,
      privateNetwork: true,
    };
  }

  async connect(host: string, port: number, username?: string): Promise<DuplexByteStream> {
    const shell = new OfflineShellEngine({ host, port, username });
    return shell.createStream();
  }
}

/** Alias for clarity in UI/docs */
export { MockSocketTransport as OfflineShellTransport };
