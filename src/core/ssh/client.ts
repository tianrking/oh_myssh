/**
 * Browser-side SSH client.
 *
 * SSH key exchange, host-key verification, authentication, encryption, PTY, shell, and
 * SFTP all execute here. The Cloudflare relay sees only the encrypted SSH byte stream.
 */
import { Buffer } from 'buffer';
import {
  AuthenticationInfoResponseMessage,
  ChannelRequestMessage,
  ChannelRequestType,
  SshAuthenticationType,
  SshClientSession,
  SshDisconnectReason,
  SshSessionConfiguration,
  type SshClientCredentials,
  type Stream,
} from '@microsoft/dev-tunnels-ssh';
import { PtyRequestMessage, WindowChangeMessage } from './pty-message';
import {
  WebStreamsSshAdapter,
  buildLocalRelayUrl,
  isLocalDevelopmentOrigin,
  openTicketedRelaySshStream,
  openWebSocketSshStream,
} from './browser-stream';
import { DirectSocketsTransport, hasDirectSockets, type DuplexByteStream } from '../socket/transport';
import { SftpClient, type SftpEntry } from './sftp-client';
import { verifyKnownHost, type ConfirmHostKey } from './known-hosts';
import { ed25519PublicKeyAlgorithm, importClientPrivateKey } from './private-key';

export type SshAuthConfig = {
  username: string;
  password?: string;
  privateKeyPem?: string;
  privateKeyPassphrase?: string;
};

export type SshConnectOptions = {
  host: string;
  port: number;
  auth: SshAuthConfig;
  /** Cloudflare raw TCP relay base URL. */
  relayUrl?: string;
  /** Kept in sessionStorage/in-memory only; never embedded in a Vercel build. */
  relayAccessToken?: string;
  cols?: number;
  rows?: number;
  connectTimeoutMs?: number;
  onStatus?: (message: string) => void;
  onClosed?: (message: string) => void;
  confirmHostKey?: ConfirmHostKey;
};

export type SshShellSession = {
  mode: 'direct' | 'cloudflare-relay' | 'local-relay';
  write: (data: string | Uint8Array) => void;
  resize: (cols: number, rows: number) => void;
  close: () => Promise<void>;
  stream: DuplexByteStream;
  openSftp: () => Promise<SftpClient>;
  session: SshClientSession;
};

export type SftpSshSession = {
  mode: SshShellSession['mode'];
  client: SftpClient;
  session: SshClientSession;
  close: () => Promise<void>;
};

type AuthenticatedSshSession = {
  mode: SshShellSession['mode'];
  session: SshClientSession;
  close: () => Promise<void>;
};

type OpenedTransport = {
  rawStream: Stream;
  mode: SshShellSession['mode'];
  timeoutMs: number;
};

const PURE_STATIC_SSH_ERROR = [
  '当前网页还没有配置可用的加密 TCP 中继，因此浏览器无法连接真实 VPS。',
  '',
  '普通网页不能直接打开 TCP/22。请在“中继设置”中填写已部署的 Oh My SSH',
  'Cloudflare Relay URL 和访问令牌。SSH 密码/私钥仍只在浏览器内使用。',
  '',
  '本地开发可直接运行 npm run dev；Vite 内置的仅本机 raw relay 会自动启用。',
].join('\n');

let ed25519Support: Promise<boolean> | undefined;

function supportsEd25519(): Promise<boolean> {
  if (!ed25519Support) {
    ed25519Support = crypto.subtle
      .importKey('raw', new Uint8Array(32), { name: 'Ed25519' }, false, ['verify'])
      .then(() => true)
      .catch(() => false);
  }
  return ed25519Support;
}

function status(options: SshConnectOptions, message: string): void {
  options.onStatus?.(message);
}

function environmentRelayUrl(): string {
  try {
    const env = (import.meta as ImportMeta & { env?: Record<string, string> }).env;
    return (env?.VITE_SSH_RELAY || '').trim();
  } catch {
    return '';
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void | Promise<void>,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          void onTimeout?.();
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Connect a real SSH shell using Direct Sockets, the configured relay, or Vite local relay. */
export async function connectSshShell(options: SshConnectOptions): Promise<SshShellSession> {
  const transport = await openConfiguredTransport(options);
  return connectSshOverStream(
    options,
    transport.rawStream,
    transport.mode,
    transport.timeoutMs,
    false,
  );
}

/** Connect and open only the SFTP subsystem; no PTY or shell channel is created. */
export async function connectSftpSession(options: SshConnectOptions): Promise<SftpSshSession> {
  const transport = await openConfiguredTransport(options);
  return connectSftpOverStream(
    options,
    transport.rawStream,
    transport.mode,
    transport.timeoutMs,
  );
}

/** Low-level SFTP-only entry point for transport adapters and interoperability tests. */
export async function connectSftpOverStream(
  options: SshConnectOptions,
  rawStream: Stream,
  mode: SshShellSession['mode'],
  timeoutMs: number,
): Promise<SftpSshSession> {
  const authenticated = await connectSshOverStream(
    options,
    rawStream,
    mode,
    timeoutMs,
    true,
  );
  try {
    const client = await openSftpClient(authenticated.session);
    let closing = false;
    return {
      mode,
      client,
      session: authenticated.session,
      async close() {
        if (closing) return;
        closing = true;
        await client.close().catch(() => undefined);
        await authenticated.close();
      },
    };
  } catch (error) {
    await authenticated.close();
    throw error;
  }
}

async function openConfiguredTransport(options: SshConnectOptions): Promise<OpenedTransport> {
  const timeoutMs = Math.max(5_000, Math.min(options.connectTimeoutMs || 25_000, 60_000));
  const relayUrl = options.relayUrl?.trim() || environmentRelayUrl();

  if (hasDirectSockets()) {
    status(options, `Direct TCP · ${options.auth.username}@${options.host}:${options.port}`);
    return { rawStream: await openDirectStream(options.host, options.port), mode: 'direct', timeoutMs };
  }

  if (relayUrl) {
    status(options, 'Requesting one-time relay ticket…');
    const stream = await openTicketedRelaySshStream(
      { url: relayUrl, accessToken: options.relayAccessToken || '' },
      options.host,
      options.port,
      Math.min(timeoutMs, 15_000),
    );
    return { rawStream: stream, mode: 'cloudflare-relay', timeoutMs };
  }

  if (isLocalDevelopmentOrigin()) {
    status(options, `Local relay · ${options.host}:${options.port}`);
    const stream = await openWebSocketSshStream(
      buildLocalRelayUrl(options.host, options.port),
      Math.min(timeoutMs, 15_000),
    );
    return { rawStream: stream, mode: 'local-relay', timeoutMs };
  }

  throw new Error(PURE_STATIC_SSH_ERROR);
}

async function openDirectStream(host: string, port: number): Promise<Stream> {
  const tcp = new DirectSocketsTransport();
  return new WebStreamsSshAdapter(await tcp.connect(host, port));
}

/** Low-level entry point used by transports and protocol interoperability tests. */
export function connectSshOverStream(
  options: SshConnectOptions,
  rawStream: Stream,
  mode: SshShellSession['mode'],
  timeoutMs: number,
  sessionOnly?: false,
): Promise<SshShellSession>;
export function connectSshOverStream(
  options: SshConnectOptions,
  rawStream: Stream,
  mode: SshShellSession['mode'],
  timeoutMs: number,
  sessionOnly: true,
): Promise<AuthenticatedSshSession>;
export async function connectSshOverStream(
  options: SshConnectOptions,
  rawStream: Stream,
  mode: SshShellSession['mode'],
  timeoutMs: number,
  sessionOnly = false,
): Promise<SshShellSession | AuthenticatedSshSession> {
  const config = new SshSessionConfiguration();
  if (await supportsEd25519()) config.publicKeyAlgorithms.unshift(ed25519PublicKeyAlgorithm);
  config.keepAliveTimeoutInSeconds = 60;
  const session = new SshClientSession(config);
  const password = options.auth.password || undefined;

  session.onAuthenticating((event) => {
    if (event.authenticationType === SshAuthenticationType.serverPublicKey && event.publicKey) {
      event.authenticationPromise = verifyKnownHost(
        options.host,
        options.port,
        event.publicKey,
        options.confirmHostKey,
      ).then((accepted) => (accepted ? {} : null));
      return;
    }
    if (
      event.authenticationType === SshAuthenticationType.clientInteractive &&
      event.infoRequest &&
      password
    ) {
      const prompts = event.infoRequest.prompts || [];
      const isSinglePasswordPrompt =
        prompts.length === 1 &&
        !prompts[0].echo &&
        /(?:password|passcode|密码)/iu.test(prompts[0].prompt || '');
      if (isSinglePasswordPrompt) {
        const response = new AuthenticationInfoResponseMessage();
        response.responses = [password];
        event.infoResponse = response;
      }
    }
  });

  try {
    status(options, 'SSH key exchange and host verification…');
    await withTimeout(
      session.connect(rawStream),
      timeoutMs,
      'SSH handshake timed out',
      () => rawStream.close(new Error('SSH handshake timeout')),
    );

    const credentials: SshClientCredentials = { username: options.auth.username };
    let importedPrivateKey: Awaited<ReturnType<typeof importClientPrivateKey>> | undefined;
    if (options.auth.privateKeyPem?.trim()) {
      status(options, 'Importing private key in browser…');
      importedPrivateKey = await importClientPrivateKey(
        options.auth.privateKeyPem,
        options.auth.privateKeyPassphrase,
      );
      if (importedPrivateKey.keyAlgorithmName === 'ssh-ed25519' && !(await supportsEd25519())) {
        importedPrivateKey.dispose();
        importedPrivateKey = undefined;
        throw new Error('This browser does not support Ed25519 Web Crypto; use RSA/ECDSA or password authentication');
      }
      credentials.publicKeys = [importedPrivateKey];
    }
    if (password) credentials.password = password;
    if (!credentials.password && !credentials.publicKeys?.length) {
      throw new Error('请提供 SSH 密码或私钥');
    }

    let authenticated = false;
    try {
      status(options, 'Authenticating…');
      authenticated = await withTimeout(
        session.authenticate(credentials),
        timeoutMs,
        'SSH authentication timed out',
      );
      // Some PAM servers expose password entry only through keyboard-interactive.
      if (!authenticated && password) {
        status(options, 'Trying keyboard-interactive password authentication…');
        authenticated = await withTimeout(
          session.authenticate({ username: options.auth.username }),
          timeoutMs,
          'Keyboard-interactive authentication timed out',
        );
      }
    } finally {
      credentials.publicKeys = undefined;
      importedPrivateKey?.dispose();
    }
    if (!authenticated) throw new Error('SSH 认证失败：凭据无效或服务器不支持该认证方式');

    if (sessionOnly) {
      let closing = false;
      return {
        mode,
        session,
        async close() {
          if (closing) return;
          closing = true;
          await session.close(SshDisconnectReason.byApplication, 'client closed').catch(() => undefined);
          await rawStream.close().catch(() => undefined);
        },
      };
    }

    const channel = await session.openChannel();
    const cols = options.cols ?? 120;
    const rows = options.rows ?? 40;
    const pty = new PtyRequestMessage();
    pty.term = 'xterm-256color';
    pty.widthChars = cols;
    pty.heightRows = rows;
    pty.wantReply = true;
    if (!(await channel.request(pty))) throw new Error('服务器拒绝 PTY 请求');

    const shellRequest = new ChannelRequestMessage(ChannelRequestType.shell, true);
    if (!(await channel.request(shellRequest))) throw new Error('服务器拒绝 shell 请求');
    status(options, 'Shell ready');

    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    let shellClosed = false;
    let closing = false;
    const onData = channel.onDataReceived((data: Buffer) => {
      if (controller) {
        const copy = new Uint8Array(data.byteLength);
        copy.set(data);
        controller.enqueue(copy);
      }
      channel.adjustWindow(data.length);
    });
    const onClosed = channel.onClosed((event) => {
      shellClosed = true;
      try {
        controller?.close();
      } catch {
        // already closed
      }
      if (!closing) {
        const detail = event.error?.message || event.errorMessage || event.exitSignal;
        options.onClosed?.(detail ? `SSH shell closed: ${detail}` : 'SSH shell closed');
      }
    });

    const readable = new ReadableStream<Uint8Array>({
      start(value) {
        controller = value;
      },
      cancel() {
        shellClosed = true;
      },
    });
    const writable = new WritableStream<Uint8Array>({
      async write(chunk) {
        if (!shellClosed && !channel.isClosed) await channel.send(Buffer.from(chunk));
      },
    });
    const close = async () => {
      if (closing) return;
      closing = true;
      shellClosed = true;
      onData.dispose();
      onClosed.dispose();
      if (!channel.isClosed) await channel.close().catch(() => undefined);
      await session.close(SshDisconnectReason.byApplication, 'client closed').catch(() => undefined);
      await rawStream.close().catch(() => undefined);
    };
    const terminalStream: DuplexByteStream = { readable, writable, close };

    return {
      mode,
      session,
      stream: terminalStream,
      write(data) {
        if (shellClosed || channel.isClosed) return;
        const bytes = typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data);
        void channel.send(bytes);
      },
      resize(width, height) {
        if (shellClosed || channel.isClosed) return;
        const message = new WindowChangeMessage();
        message.widthChars = width;
        message.heightRows = height;
        message.wantReply = false;
        void channel.request(message);
      },
      close,
      async openSftp() {
        return openSftpClient(session);
      },
    };
  } catch (error) {
    await session.close(SshDisconnectReason.byApplication, 'connection failed').catch(() => undefined);
    await rawStream.close(error instanceof Error ? error : new Error(String(error))).catch(() => undefined);
    throw error;
  }
}

async function openSftpClient(session: SshClientSession): Promise<SftpClient> {
  const sftpChannel = await session.openChannel();
  const subsystem = new SubsystemRequestMessage('sftp');
  if (!(await sftpChannel.request(subsystem))) {
    await sftpChannel.close().catch(() => undefined);
    throw new Error('服务器拒绝 SFTP subsystem');
  }
  return new SftpClient(sftpChannel);
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
