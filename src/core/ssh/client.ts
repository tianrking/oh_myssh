/**
 * SSH connect for pure-static frontend (Vercel-friendly).
 *
 * Reality check:
 * - A normal webpage cannot open raw TCP/22 to arbitrary IPs (browser security).
 * - Sites that "just open and SSH" always have a backend somewhere.
 * - Pure Vercel static: UI + offline shell + local vault only, unless:
 *   (1) browser has Direct Sockets (rare / IWA), or
 *   (2) you set VITE_SSH_GATEWAY / advanced bridge URL (someone else's server).
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
import { connectViaWebSshGateway } from './gateway-client';

export type SshAuthConfig = {
  username: string;
  password?: string;
  privateKeyPem?: string;
};

export type SshConnectOptions = {
  host: string;
  port: number;
  auth: SshAuthConfig;
  /** Optional WebSSH gateway WebSocket URL (NOT provided by pure Vercel static) */
  gatewayUrl?: string;
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
  session?: SshClientSession;
};

function status(opts: SshConnectOptions, msg: string) {
  opts.onStatus?.(msg);
}

function envGateway(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    return (env?.VITE_SSH_GATEWAY || '').trim();
  } catch {
    return '';
  }
}

const PURE_STATIC_SSH_ERROR = [
  '当前没有可用的 WebSSH 网关，无法连接真实 VPS。',
  '',
  'Chrome 普通网页不能直连 TCP/22，必须经网关：',
  '  浏览器  →  网关  →  你的 VPS:22',
  '',
  '本地立刻能连：',
  '  npm run dev:with-gateway',
  '  然后快速连接 root@host:22 + 密码',
  '',
  '免费自建网关（推荐）：',
  '  在任意免费/便宜的 VPS 上: npm run build && npm start',
  '  或只跑: npm run gateway   （端口 3922）',
  '  前端构建时设置: VITE_SSH_GATEWAY=wss://你的域名/ssh',
  '',
  '注意：公网「免费公共网关」极少且极危险（密码会过别人机器），请自建。',
].join('\n');

/**
 * Connect SSH shell.
 * Order:
 *  1) WebSSH gateway (same-origin / env / explicit) — recommended product path
 *  2) DirectSockets (rare)
 *  3) Advanced raw bridge
 *  4) Clear error if nothing available
 *
 * Gateway path is NOT "direct TCP from Chrome"; it is classic WebSSH
 * (browser → gateway → VPS). Free if you self-host the gateway.
 */
export async function connectSshShell(opts: SshConnectOptions): Promise<SshShellSession> {
  const { host, port, auth } = opts;

  // Candidate gateway URLs (first that works wins)
  const candidates: string[] = [];
  if (opts.gatewayUrl?.trim()) candidates.push(opts.gatewayUrl.trim());
  const fromEnv = envGateway();
  if (fromEnv) candidates.push(fromEnv);
  // Same-origin paths: prod all-in-one + vite dev proxy
  if (typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const base = `${proto}//${window.location.host}`;
    candidates.push(`${base}/ssh-ws`, `${base}/ssh`);
  }

  let lastGwError: Error | null = null;
  for (const gateway of candidates) {
    try {
      status(opts, `Gateway · ${auth.username}@${host}:${port}`);
      const gw = await connectViaWebSshGateway({
        host,
        port,
        username: auth.username,
        password: auth.password,
        privateKey: auth.privateKeyPem,
        cols: opts.cols,
        rows: opts.rows,
        gatewayUrl: gateway,
        onStatus: opts.onStatus,
      });
      return {
        mode: 'webssh-gateway',
        stream: gw.stream,
        write: gw.write,
        resize: gw.resize,
        close: gw.close,
        openSftp: async () => {
          throw new Error('SFTP over gateway: open a dedicated SFTP session later');
        },
      };
    } catch (e) {
      lastGwError = e instanceof Error ? e : new Error(String(e));
      // try next candidate
    }
  }

  // DirectSockets (not normal Chrome webpage)
  if (hasDirectSockets()) {
    status(opts, `Direct TCP · ${auth.username}@${host}:${port}`);
    return connectBrowserSsh(opts, await openDirectStream(host, port), 'direct');
  }

  // Advanced raw bridge from settings
  if (opts.relayUrl && opts.relayUrl.trim()) {
    status(opts, `Bridge · ${host}:${port}`);
    const url = buildRelayUrl(opts.relayUrl.trim(), host, port);
    const stream = await openWebSocketSshStream(url);
    return connectBrowserSsh(opts, stream, 'optional-bridge');
  }

  const hint = lastGwError ? `\n\n(网关尝试失败: ${lastGwError.message})` : '';
  throw new Error(PURE_STATIC_SSH_ERROR + hint);
}

async function openDirectStream(host: string, port: number): Promise<Stream> {
  const tcp = new DirectSocketsTransport();
  const duplex = await tcp.connect(host, port);
  return new WebStreamsSshAdapter(duplex);
}

async function connectBrowserSsh(
  opts: SshConnectOptions,
  stream: Stream,
  mode: 'direct' | 'optional-bridge'
): Promise<SshShellSession> {
  const { auth } = opts;
  status(opts, 'SSH handshake…');

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
    await session
      .close(SshDisconnectReason.noMoreAuthMethodsAvailable, 'auth failed')
      .catch(() => {});
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
