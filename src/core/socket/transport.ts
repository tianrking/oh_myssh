/**
 * Oh My SSH - Socket Transport Abstraction Layer
 * 隔离 Chromium Direct Sockets (IWA)、WebSocket Relay 以及全功能真实体验 Mock Terminal
 */

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
  connect(host: string, port: number): Promise<DuplexByteStream>;
}

/**
 * Chromium Direct Sockets Transport (用于 Chromium Isolated Web App IWA 环境)
 */
export class DirectSocketsTransport implements SocketTransport {
  readonly name = 'Direct Sockets (Chromium IWA)';

  async probe(): Promise<SocketCapabilities> {
    const hasTCPSocket = typeof window !== 'undefined' && 'TCPSocket' in window;
    return {
      directTcp: hasTCPSocket,
      tcpListen: false,
      udp: typeof window !== 'undefined' && 'UDPSocket' in window,
      portForwarding: hasTCPSocket,
      privateNetwork: true,
    };
  }

  async connect(host: string, port: number): Promise<DuplexByteStream> {
    if (typeof window === 'undefined' || !('TCPSocket' in window)) {
      throw new Error('当前浏览器环境不支持 Chromium Direct Sockets (TCPSocket)。请使用 IWA 模式或配置 WebSocket 中继。');
    }

    // @ts-ignore - Direct Sockets API
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
 * WebSocket Relay Transport (用于第三方或自建 SSH WebSocket Gateway)
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
      ws.onopen = () => resolve();
      ws.onerror = (err) => reject(new Error('WebSocket 连接失败'));
    });

    const readable = new ReadableStream<Uint8Array>({
      start(controller) {
        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            controller.enqueue(new Uint8Array(event.data));
          } else if (typeof event.data === 'string') {
            const encoder = new TextEncoder();
            controller.enqueue(encoder.encode(event.data));
          }
        };
        ws.onclose = () => controller.close();
        ws.onerror = (e) => controller.error(e);
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
 * 全功能毫秒级交互式模拟终端 (Zero-Latency Echo & Interactive Shell Engine)
 */
export class MockSocketTransport implements SocketTransport {
  readonly name = 'Mock Interactive Shell';

  async probe(): Promise<SocketCapabilities> {
    return {
      directTcp: true,
      tcpListen: true,
      udp: true,
      portForwarding: true,
      privateNetwork: true,
    };
  }

  async connect(host: string, port: number): Promise<DuplexByteStream> {
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const encoder = new TextEncoder();
    let currentInput = '';

    const sendRaw = (text: string) => {
      if (controllerRef) {
        controllerRef.enqueue(encoder.encode(text));
      }
    };

    const sendLine = (text: string) => {
      sendRaw(text + '\r\n');
    };

    const prompt = () => {
      sendRaw(`\x1b[1;32mroot@${host}\x1b[0m:\x1b[1;34m~\x1b[0m# `);
    };

    const readable = new ReadableStream<Uint8Array>({
      start(ctrl) {
        controllerRef = ctrl;
        setTimeout(() => {
          sendLine(`\x1b[1;36m====================================================\x1b[0m`);
          sendLine(`\x1b[1;32m Connected to ${host}:${port} via Oh My SSH WASM engine!\x1b[0m`);
          sendLine(` Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-40-generic x86_64)`);
          sendLine(` System load: 0.08, Memory usage: 18%, Local Time: ${new Date().toLocaleString()}`);
          sendLine(`\x1b[1;36m====================================================\x1b[0m`);
          sendLine(``);
          prompt();
        }, 50);
      },
    });

    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        const text = new TextDecoder().decode(chunk);
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const code = char.charCodeAt(0);

          if (char === '\r' || char === '\n') {
            sendLine('');
            const cmd = currentInput.trim();
            currentInput = '';
            
            if (cmd === 'help') {
              sendLine('\x1b[1;33mOh My SSH Built-in Interactive Shell Commands:\x1b[0m');
              sendLine('  help      - 显示可用指令列表');
              sendLine('  ls / ll   - 查看当前目录下文件');
              sendLine('  pwd       - 输出当前工作目录');
              sendLine('  whoami    - 查看当前登录用户');
              sendLine('  uname     - 查看 Linux 系统内核');
              sendLine('  neofetch  - 展示彩色系统硬件信息');
              sendLine('  clear     - 清空终端屏显');
              sendLine('  date      - 查看当前系统时间');
            } else if (cmd === 'uname' || cmd === 'uname -a') {
              sendLine('Linux oh-myssh-node 6.8.0-40-generic #40-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux');
            } else if (cmd === 'pwd') {
              sendLine('/root');
            } else if (cmd === 'whoami') {
              sendLine('root');
            } else if (cmd === 'date') {
              sendLine(new Date().toString());
            } else if (cmd === 'ls' || cmd === 'll') {
              sendLine('drwxr-xr-x 4 root root 4096 Jul 24 11:20 \x1b[1;34mprojects\x1b[0m');
              sendLine('drwxr-xr-x 2 root root 4096 Jul 24 11:20 \x1b[1;34mscripts\x1b[0m');
              sendLine('-rw-r--r-- 1 root root 1024 Jul 24 11:20 \x1b[1;32mdeploy.sh\x1b[0m');
              sendLine('-rw-r--r-- 1 root root 2048 Jul 24 11:20 docker-compose.yml');
            } else if (cmd === 'neofetch') {
              sendLine('  \x1b[1;31m/\\_/\\\x1b[0m   \x1b[1;33mroot@' + host + '\x1b[0m');
              sendLine(' \x1b[1;31m( o.o )\x1b[0m  --------------');
              sendLine('  \x1b[1;31m> ^ <\x1b[0m   OS: Oh My SSH WebAssembly OS');
              sendLine('          Kernel: WASM DirectSocket 2.0');
              sendLine('          Uptime: 42 days, 3 hours');
              sendLine('          Shell: zsh 5.9');
              sendLine('          Terminal: xterm.js WebGL Engine');
            } else if (cmd === 'clear') {
              sendRaw('\x1b[2J\x1b[H');
            } else if (cmd.length > 0) {
              sendLine(`zsh: command not found: ${cmd}`);
            }
            prompt();
          } else if (code === 127 || code === 8) { // Backspace / Delete
            if (currentInput.length > 0) {
              currentInput = currentInput.slice(0, -1);
              sendRaw('\b \b'); // 回退光标 + 空格擦除 + 再次回退
            }
          } else if (code === 3) { // Ctrl+C
            currentInput = '';
            sendLine('^C');
            prompt();
          } else if (code === 12) { // Ctrl+L
            currentInput = '';
            sendRaw('\x1b[2J\x1b[H');
            prompt();
          } else {
            // 标准可打印字符：即时原样 Echo 显示，追加到 buffer
            currentInput += char;
            sendRaw(char);
          }
        }
      },
    });

    return {
      readable,
      writable,
      close: async () => {},
    };
  }
}
