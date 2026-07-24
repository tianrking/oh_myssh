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
  /** Explicit WebSocket relay base URL; empty = auto */
  relayUrl?: string;
  cols?: number;
  rows?: number;
  onStatus?: (msg: string) => void;
};

export type SshShellSession = {
  mode: 'direct' | 'relay' | 'local-relay';
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
 * Resolve transport stream for SSH protocol bytes.
 * Priority: DirectSockets → user relay → same-origin Vite local relay.
 */
export async function openTransportStream(
  host: string,
  port: number,
  relayUrl?: string
): Promise<{ stream: Stream; mode: SshShellSession['mode'] }> {
  if (hasDirectSockets()) {
    const tcp = new DirectSocketsTransport();
    const duplex = await tcp.connect(host, port);
    return { stream: new WebStreamsSshAdapter(duplex), mode: 'direct' };
  }

  if (relayUrl && relayUrl.trim()) {
    const url = buildRelayUrl(relayUrl.trim(), host, port);
    return { stream: await openWebSocketSshStream(url), mode: 'relay' };
  }

  // Auto local Vite/preview relay (dev & preview servers only)
  if (typeof window !== 'undefined') {
    const local = buildLocalRelayUrl(host, port);
    try {
      const stream = await openWebSocketSshStream(local, 8000);
      return { stream, mode: 'local-relay' };
    } catch (e) {
      throw new Error(
        `无法建立 TCP 传输层。浏览器无 DirectSockets，本地中继不可用 (${(e as Error).message})。` +
          `请用 npm run dev 启动（内置 WS→TCP），或配置 Relay，或使用 Chromium IWA。`
      );
    }
  }

  throw new Error('No SSH transport available');
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
