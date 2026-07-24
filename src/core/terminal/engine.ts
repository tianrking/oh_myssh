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
  private stream: DuplexByteStream | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private isConnected = false;
  private logBuffer: string[] = [];

  constructor(themeName: string = 'cyberpunk', scrollback: number = 10000) {
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: "'Fira Code', ui-monospace, Menlo, Monaco, Consolas, monospace",
      theme: TERMINAL_THEMES[themeName] || TERMINAL_THEMES.cyberpunk,
      allowProposedApi: true,
      smoothScrollDuration: 0, // 极速响应，消灭动画卡顿
      macOptionIsMeta: true,
      scrollback: scrollback,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
  }

  public mount(container: HTMLElement) {
    this.terminal.open(container);
    
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
      this.terminal.loadAddon(webglAddon);
    } catch (e) {
      console.warn('WebGL addon 加载失败，回退至 Canvas 渲染器', e);
    }

    setTimeout(() => {
      this.fitAddon.fit();
      this.terminal.focus();
    }, 50);
  }

  public attachStream(stream: DuplexByteStream) {
    this.stream = stream;
    this.isConnected = true;

    this.reader = stream.readable.getReader();
    this.writer = stream.writable.getWriter();

    // 监听键盘输入数据，直接毫秒级写出
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
