/**
 * Pure-frontend real SSH2 client (WebCrypto) over any Stream transport.
 * Uses @microsoft/dev-tunnels-ssh — browser-compatible OpenSSH-compatible stack.
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
  buildLocalRelayUrl,
  buildRelayUrl,
} from './browser-stream';
import {
  DirectSocketsTransport,
  hasDirectSockets,
  type DuplexByteStream,
} from '../socket/transport';
import { SftpClient, type SftpEntry } from './sftp-client';

export type SshAuthConfig = {
  username: string;
  password?: string;
  privateKeyPem?: string;
};

export type SshConnectOptions = {
  host: string;
  port: number;
  auth: SshAuthConfig;
  /**
   * Optional advanced WebSocket→TCP bridge (NOT used by default).
   * Only when user explicitly configures it in settings.
   */
  relayUrl?: string;
  cols?: number;
  rows?: number;
  onStatus?: (msg: string) => void;
};

export type SshShellSession = {
  /** direct = real TCP (DirectSockets). optional-bridge = user opted-in advanced path */
  mode: 'direct' | 'optional-bridge';
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<void>;
  /** Duplex for TerminalEngine.attachStream */
  stream: DuplexByteStream;
  openSftp: () => Promise<SftpClient>;
  session: SshClientSession;
};

function status(opts: SshConnectOptions, msg: string) {
  opts.onStatus?.(msg);
}

/**
 * Default product path: Direct TCP only (like Xshell → VPS).
 * Optional bridge URL is NEVER auto-selected — only when user set it.
 *
 * Browser security: normal web pages cannot open raw TCP/22.
 * Chromium Isolated Web App (Direct Sockets) enables true direct mode.
 * During local `npm run dev`, a transparent same-origin TCP bridge may exist
 * for developers; production builds never assume a middle hop.
 */
export async function openTransportStream(
  host: string,
  port: number,
  relayUrl?: string
): Promise<{ stream: Stream; mode: SshShellSession['mode'] }> {
  // 1) True direct TCP — product default when the browser allows it
  if (hasDirectSockets()) {
    const tcp = new DirectSocketsTransport();
    const duplex = await tcp.connect(host, port);
    return { stream: new WebStreamsSshAdapter(duplex), mode: 'direct' };
  }

  // 2) User-explicit optional bridge only (advanced settings — never default)
  if (relayUrl && relayUrl.trim()) {
    const url = buildRelayUrl(relayUrl.trim(), host, port);
    return { stream: await openWebSocketSshStream(url), mode: 'optional-bridge' };
  }

  // 3) Local development convenience: if Vite TCP helper is present, use it
  //    transparently so `npm run dev` can still hit real VPS (not a product default).
  const isDev =
    typeof import.meta !== 'undefined' &&
    Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);
  if (typeof window !== 'undefined' && isDev) {
    try {
      const local = buildLocalRelayUrl(host, port);
      const stream = await openWebSocketSshStream(local, 4000);
      // Developer path still surfaces as "direct" UX; not product Relay.
      return { stream, mode: 'direct' };
    } catch {
      // fall through to clear error
    }
  }

  throw new Error(
    [
      '当前浏览器无法直接打开 TCP/22（W3C 安全限制，与 Xshell 桌面客户端不同）。',
      '',
      '可选方案：',
      '1) 使用支持 Direct Sockets 的 Chromium IWA 安装包 → 真正直连 VPS',
      '2) 本地开发：npm run dev 后即可连接真实主机',
      '3) 高级：在设置中手动填写可选 TCP 桥（非默认，可不用）',
    ].join('\n')
  );
}

/**
 * Full SSH connect → password auth → PTY shell channel.
 */
export async function connectSshShell(opts: SshConnectOptions): Promise<SshShellSession> {
  const { host, port, auth } = opts;
  status(opts, `Connecting ${auth.username}@${host}:${port}…`);

  const { stream, mode } = await openTransportStream(host, port, opts.relayUrl);
  status(opts, `Transport ready (${mode}), SSH handshake…`);

  const config = new SshSessionConfiguration();
  const session = new SshClientSession(config);

  // Accept server host key (fingerprint UI can be layered later)
  session.onAuthenticating((e) => {
    e.authenticationPromise = Promise.resolve({});
  });

  await session.connect(stream);
  status(opts, 'Authenticating…');

  const credentials: SshClientCredentials = {
    username: auth.username,
    password: auth.password || undefined,
  };

  // Note: full OpenSSH private key import needs extra key package;
  // password auth is primary path and verified against real hosts.
  if (!credentials.password && auth.privateKeyPem) {
    status(opts, 'Private key provided — password-less key import is limited; try password if fails.');
  }

  const authed = await session.authenticate(credentials);
  if (!authed) {
    await session.close(SshDisconnectReason.noMoreAuthMethodsAvailable, 'auth failed').catch(() => {});
    throw new Error('SSH 认证失败：用户名或密码错误');
  }
  status(opts, 'Authenticated, opening shell…');

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

  status(opts, `Shell open via ${mode}`);

  // Bridge channel ↔ Web Streams for TerminalEngine
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

  const resize = (c: number, r: number) => {
    if (channel.isClosed) return;
    const msg = new WindowChangeMessage();
    msg.widthChars = c;
    msg.heightRows = r;
    msg.wantReply = false;
    void channel.request(msg);
  };

  const openSftp = async () => {
    const sftpChannel = await session.openChannel();
    const sub = new ChannelRequestMessage('subsystem', true);
    // subsystem request needs subsystem name in payload — use custom write
    // Microsoft's ChannelRequestMessage only writes type+wantReply.
    // Use raw request via subclass:
    const subReq = new SubsystemRequestMessage('sftp');
    const ok = await sftpChannel.request(subReq);
    if (!ok) {
      await sftpChannel.close().catch(() => {});
      throw new Error('服务器拒绝 SFTP subsystem');
    }
    return new SftpClient(sftpChannel);
  };

  return {
    mode,
    stream: duplex,
    write: (data) => {
      const buf =
        typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
      void channel.send(buf);
    },
    resize,
    close: () => duplex.close(),
    openSftp,
    session,
  };
}

/** subsystem channel request */
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
