/**
 * SSH connection facade.
 * Default product path = classic WebSSH gateway (open webpage → manage VPS).
 * Fallbacks: DirectSockets / optional browser SSH stack (advanced).
 */
import { Buffer } from 'buffer';
import {
  SshClientSession,
  SshSessionConfiguration,
  ChannelRequestMessage,
  ChannelRequestType,
  SshDisconnectReason,
  type Stream,
  type SshClientCredentials,
} from '@microsoft/dev-tunnels-ssh';
import { PtyRequestMessage, WindowChangeMessage } from './pty-message';
import {
  WebStreamsSshAdapter,
  openWebSocketSshStream,
  buildRelayUrl,
} from './browser-stream';
import {
  DirectSocketsTransport,
  hasDirectSockets,
  type DuplexByteStream,
} from '../socket/transport';
import { SftpClient, type SftpEntry } from './sftp-client';
import { connectViaWebSshGateway, resolveGatewayWsUrl } from './gateway-client';

export type SshAuthConfig = {
  username: string;
  password?: string;
  privateKeyPem?: string;
};

export type SshConnectOptions = {
  host: string;
  port: number;
  auth: SshAuthConfig;
  /** Optional explicit gateway WebSocket URL (defaults to same-origin /ssh-ws) */
  gatewayUrl?: string;
  /** Skip gateway and try browser-side transports only */
  preferBrowserDirect?: boolean;
  /** Advanced: raw TCP bridge URL (not default) */
  relayUrl?: string;
  cols?: number;
  rows?: number;
  onStatus?: (msg: string) => void;
};

export type SshShellSession = {
  mode: 'webssh-gateway' | 'direct' | 'optional-bridge';
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<void>;
  stream: DuplexByteStream;
  openSftp: () => Promise<SftpClient>;
  /** Present only for in-browser SSH stack */
  session?: SshClientSession;
};

function status(opts: SshConnectOptions, msg: string) {
  opts.onStatus?.(msg);
}

/**
 * Default: WebSSH gateway (browser opens page → gateway dials SSH).
 * Optional: DirectSockets / in-browser SSH if gateway unavailable and user opts in.
 */
export async function connectSshShell(opts: SshConnectOptions): Promise<SshShellSession> {
  const { host, port, auth } = opts;

  // ——— Primary: classic WebSSH gateway ———
  if (!opts.preferBrowserDirect) {
    try {
      status(opts, `WebSSH · ${auth.username}@${host}:${port}`);
      const gw = await connectViaWebSshGateway({
        host,
        port,
        username: auth.username,
        password: auth.password,
        privateKey: auth.privateKeyPem,
        cols: opts.cols,
        rows: opts.rows,
        gatewayUrl: opts.gatewayUrl,
        onStatus: opts.onStatus,
      });

      return {
        mode: 'webssh-gateway',
        stream: gw.stream,
        write: gw.write,
        resize: gw.resize,
        close: gw.close,
        openSftp: async () => {
          throw new Error(
            'SFTP via gateway: 请新开 SFTP 标签（将建立独立 SSH 会话）。完整多路复用后续版本支持。'
          );
        },
      };
    } catch (e) {
      // If user forced no fallback, rethrow
      const msg = e instanceof Error ? e.message : String(e);
      status(opts, `Gateway failed: ${msg}`);
      // Fall through only when DirectSockets or explicit relay available
      if (!hasDirectSockets() && !(opts.relayUrl && opts.relayUrl.trim())) {
        throw new Error(
          [
            msg,
            '',
            'WebSSH 需要网关进程（像所有在线 WebSSH 一样）：',
            '  本地：npm run dev   （会同时启动 UI + 网关）',
            '  或单独：npm run gateway',
            '',
            `当前网关地址：${resolveGatewayWsUrl(opts.gatewayUrl)}`,
          ].join('\n')
        );
      }
      status(opts, 'Falling back to browser direct transport…');
    }
  }

  // ——— Fallback: browser DirectSockets / optional raw bridge + in-browser SSH2 ———
  const { stream, mode } = await openBrowserTransport(host, port, opts.relayUrl);
  status(opts, `Transport ${mode}, SSH handshake…`);

  const config = new SshSessionConfiguration();
  const session = new SshClientSession(config);
  session.onAuthenticating((e) => {
    e.authenticationPromise = Promise.resolve({});
  });

  await session.connect(stream);
  status(opts, 'Authenticating…');

  const credentials: SshClientCredentials = {
    username: auth.username,
    password: auth.password || undefined,
  };
  const authed = await session.authenticate(credentials);
  if (!authed) {
    await session.close(SshDisconnectReason.noMoreAuthMethodsAvailable, 'auth failed').catch(() => {});
    throw new Error('SSH 认证失败：用户名或密码错误');
  }

  const channel = await session.openChannel();
  const cols = opts.cols ?? 120;
  const rows = opts.rows ?? 40;
  const pty = new PtyRequestMessage();
  pty.term = 'xterm-256color';
  pty.widthChars = cols;
  pty.heightRows = rows;
  pty.wantReply = true;
  await channel.request(pty);

  const shellReq = new ChannelRequestMessage(ChannelRequestType.shell, true);
  const shellOk = await channel.request(shellReq);
  if (!shellOk) {
    await channel.close().catch(() => {});
    await session.close(SshDisconnectReason.byApplication, 'shell denied').catch(() => {});
    throw new Error('服务器拒绝 shell 请求');
  }

  status(opts, 'Shell open');

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  let closed = false;

  const onData = channel.onDataReceived((data: Buffer) => {
    if (controller) {
      const u8 = new Uint8Array(data.byteLength);
      u8.set(data);
      controller.enqueue(u8);
    }
    channel.adjustWindow(data.length);
  });

  const onClosed = channel.onClosed(() => {
    closed = true;
    try {
      controller?.close();
    } catch {
      /* ignore */
    }
  });

  const readable = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
    },
  });

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      if (closed || channel.isClosed) return;
      await channel.send(Buffer.from(chunk));
    },
  });

  const duplex: DuplexByteStream = {
    readable,
    writable,
    close: async () => {
      onData.dispose();
      onClosed.dispose();
      await channel.close().catch(() => {});
      await session.close(SshDisconnectReason.byApplication, 'client closed').catch(() => {});
    },
  };

  return {
    mode,
    stream: duplex,
    write: (data) => {
      const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
      void channel.send(buf);
    },
    resize: (c, r) => {
      if (channel.isClosed) return;
      const msg = new WindowChangeMessage();
      msg.widthChars = c;
      msg.heightRows = r;
      msg.wantReply = false;
      void channel.request(msg);
    },
    close: () => duplex.close(),
    openSftp: async () => {
      const sftpChannel = await session.openChannel();
      const subReq = new SubsystemRequestMessage('sftp');
      const ok = await sftpChannel.request(subReq);
      if (!ok) {
        await sftpChannel.close().catch(() => {});
        throw new Error('服务器拒绝 SFTP subsystem');
      }
      return new SftpClient(sftpChannel);
    },
    session,
  };
}

async function openBrowserTransport(
  host: string,
  port: number,
  relayUrl?: string
): Promise<{ stream: Stream; mode: 'direct' | 'optional-bridge' }> {
  if (hasDirectSockets()) {
    const tcp = new DirectSocketsTransport();
    const duplex = await tcp.connect(host, port);
    return { stream: new WebStreamsSshAdapter(duplex), mode: 'direct' };
  }
  if (relayUrl && relayUrl.trim()) {
    const url = buildRelayUrl(relayUrl.trim(), host, port);
    return { stream: await openWebSocketSshStream(url), mode: 'optional-bridge' };
  }
  throw new Error('No browser direct transport available');
}

class SubsystemRequestMessage extends ChannelRequestMessage {
  constructor(private subsystem: string) {
    super('subsystem', true);
  }

  protected onWrite(writer: import('@microsoft/dev-tunnels-ssh').SshDataWriter): void {
    super.onWrite(writer);
    writer.writeString(this.subsystem, 'utf8');
  }

  protected onRead(reader: import('@microsoft/dev-tunnels-ssh').SshDataReader): void {
    super.onRead(reader);
    this.subsystem = reader.readString('utf8');
  }
}

export type { SftpEntry };
export { resolveGatewayWsUrl } from './gateway-client';
