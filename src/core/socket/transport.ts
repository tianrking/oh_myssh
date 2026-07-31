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

export function hasDirectSockets(): boolean {
  return typeof window !== 'undefined' && 'TCPSocket' in window;
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
