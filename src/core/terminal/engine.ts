import { Terminal, type ITerminalOptions } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import type { DuplexByteStream } from '../socket/transport';

export interface TerminalThemeOptions {
  name: string;
  theme: ITerminalOptions['theme'];
}

export const TERMINAL_THEMES: Record<string, ITerminalOptions['theme']> = {
  cyberpunk: {
    background: '#090d16',
    foreground: '#00f0ff',
    cursor: '#ff0055',
    cursorAccent: '#090d16',
    selectionBackground: 'rgba(255, 0, 85, 0.3)',
    black: '#000000',
    red: '#ff0055',
    green: '#00ff66',
    yellow: '#ffe600',
    blue: '#00b8ff',
    magenta: '#d600ff',
    cyan: '#00f0ff',
    white: '#ffffff',
  },
  oneDark: {
    background: '#1e222a',
    foreground: '#abb2bf',
    cursor: '#528bff',
    selectionBackground: '#3e4451',
    black: '#1e222a',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#d19a66',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#abb2bf',
  },
  dracula: {
    background: '#282a36',
    foreground: '#f8f8f2',
    cursor: '#f8f8f2',
    selectionBackground: '#44475a',
    black: '#21222c',
    red: '#ff5555',
    green: '#50fa7b',
    yellow: '#f1fa8c',
    blue: '#bd93f9',
    magenta: '#ff79c6',
    cyan: '#8be9fd',
    white: '#f8f8f2',
  },
  monokai: {
    background: '#272822',
    foreground: '#f8f8f2',
    cursor: '#f8f8f0',
    selectionBackground: '#49483e',
    black: '#272822',
    red: '#f92672',
    green: '#a6e22e',
    yellow: '#e6db74',
    blue: '#66d9ef',
    magenta: '#ae81ff',
    cyan: '#a1efe4',
    white: '#f8f8f2',
  },
  xshellClassic: {
    background: '#000000',
    foreground: '#00ff00',
    cursor: '#00ff00',
    selectionBackground: 'rgba(0, 255, 0, 0.3)',
    black: '#000000',
    red: '#cd0000',
    green: '#00cd00',
    yellow: '#cdcd00',
    blue: '#0000ee',
    magenta: '#cd00cd',
    cyan: '#00cdcd',
    white: '#e5e5e5',
  },
};

export class TerminalEngine {
  public terminal: Terminal;
  public fitAddon: FitAddon;
  private webglAddon: WebglAddon | null = null;
  private stream: DuplexByteStream | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private isConnected = false;
  private logBuffer: string[] = [];
  private isComposing = false;
  private containerElement: HTMLElement | null = null;

  constructor(themeName: string = 'cyberpunk', scrollback: number = 10000) {
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace",
      theme: TERMINAL_THEMES[themeName] || TERMINAL_THEMES.cyberpunk,
      allowProposedApi: true,
      smoothScrollDuration: 0, // 消除滚动延迟
      macOptionIsMeta: true,
      scrollback: scrollback,
      rightClickSelectsWord: true,
      fastScrollModifier: 'alt',
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
  }

  public mount(container: HTMLElement) {
    this.containerElement = container;
    this.terminal.open(container);
    
    // 自动挂载 WebGL 加速，失败时优雅降级 2D Canvas
    this.enableWebGL();

    // 绑定 macOS 输入法 IME 合成事件与 DOM 点击 Focus 抢占
    this.bindInputOptimizations(container);

    setTimeout(() => {
      this.fitAddon.fit();
      this.terminal.focus();
    }, 30);
  }

  public enableWebGL(): boolean {
    try {
      if (!this.webglAddon) {
        this.webglAddon = new WebglAddon();
        this.webglAddon.onContextLoss(() => {
          this.disableWebGL();
        });
        this.terminal.loadAddon(this.webglAddon);
      }
      return true;
    } catch (e) {
      console.warn('WebGL 加载受限，回退至 Canvas 极速绘制模式', e);
      this.disableWebGL();
      return false;
    }
  }

  public disableWebGL() {
    if (this.webglAddon) {
      try {
        this.webglAddon.dispose();
      } catch (e) {}
      this.webglAddon = null;
    }
  }

  private bindInputOptimizations(container: HTMLElement) {
    // 监听容器点击强行抢占 Focus，保障打字输入零卡顿
    container.addEventListener('click', () => {
      this.terminal.focus();
    });

    // 监听隐藏 textarea 的 macOS 输入法 Composition 事件
    setTimeout(() => {
      const helperTextarea = container.querySelector('.xterm-helper-textarea') as HTMLTextAreaElement;
      if (helperTextarea) {
        helperTextarea.addEventListener('compositionstart', () => {
          this.isComposing = true;
        });
        helperTextarea.addEventListener('compositionend', () => {
          this.isComposing = false;
        });
      }
    }, 100);
  }

  public attachStream(stream: DuplexByteStream) {
    this.stream = stream;
    this.isConnected = true;

    this.reader = stream.readable.getReader();
    this.writer = stream.writable.getWriter();

    // 监听键盘输入数据，毫秒级直接送达传输管道
    this.terminal.onData((data) => {
      if (this.writer && this.isConnected) {
        const encoder = new TextEncoder();
        this.writer.write(encoder.encode(data));
      }
    });

    // 读取 Socket 字节数据渲染到 Terminal
    this.readLoop();
  }

  public writeInput(data: string) {
    if (this.writer && this.isConnected) {
      const encoder = new TextEncoder();
      this.writer.write(encoder.encode(data));
    }
  }

  private async readLoop() {
    if (!this.reader) return;
    try {
      while (this.isConnected) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.terminal.write(value);
          const decoded = new TextDecoder().decode(value);
          this.logBuffer.push(decoded);
        }
      }
    } catch (err) {
      console.error('Terminal Stream read error:', err);
    } finally {
      this.isConnected = false;
    }
  }

  public exportLog(): string {
    return this.logBuffer.join('');
  }

  public resize() {
    try {
      this.fitAddon.fit();
    } catch (e) {
      // 忽略解挂时的布局计算错误
    }
  }

  public setTheme(themeName: string) {
    if (TERMINAL_THEMES[themeName]) {
      this.terminal.options.theme = TERMINAL_THEMES[themeName];
    }
  }

  public dispose() {
    this.isConnected = false;
    this.disableWebGL();
    if (this.reader) {
      this.reader.cancel().catch(() => {});
    }
    if (this.writer) {
      this.writer.close().catch(() => {});
    }
    if (this.stream) {
      this.stream.close().catch(() => {});
    }
    this.terminal.dispose();
  }
}
