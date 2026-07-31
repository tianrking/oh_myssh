import { Terminal, type ITerminalOptions, type IDisposable } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { WebglAddon } from '@xterm/addon-webgl';
import type { DuplexByteStream } from '../socket/transport';
import { StreamFrameBatcher } from './batcher';

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

const MAX_LOG_CHARS = 2_000_000;

export class TerminalEngine {
  public terminal: Terminal;
  public fitAddon: FitAddon;
  private webglAddon: WebglAddon | null = null;
  private stream: DuplexByteStream | null = null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private isConnected = false;
  private logBuffer: string[] = [];
  private logChars = 0;
  private isComposing = false;
  private containerElement: HTMLElement | null = null;
  private dataDisposable: IDisposable | null = null;
  private batcher: StreamFrameBatcher | null = null;
  private readAbort = false;
  private disposed = false;
  private webglLoad: Promise<boolean> | null = null;
  private readonly handleContainerClick = () => this.terminal.focus();

  constructor(themeName: string = 'cyberpunk', scrollback: number = 10000) {
    this.terminal = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily:
        "'Fira Code', 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, monospace",
      theme: TERMINAL_THEMES[themeName] || TERMINAL_THEMES.cyberpunk,
      allowProposedApi: true,
      smoothScrollDuration: 0,
      macOptionIsMeta: true,
      scrollback,
      rightClickSelectsWord: true,
      fastScrollModifier: 'alt',
      convertEol: false,
      windowsMode: false,
    });

    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
  }

  public mount(container: HTMLElement) {
    this.containerElement = container;
    this.terminal.open(container);
    void this.enableWebGL();
    this.bindInputOptimizations(container);

    // Fit after layout settles
    requestAnimationFrame(() => {
      this.fitAddon.fit();
      this.terminal.focus();
    });
  }

  public enableWebGL(): Promise<boolean> {
    if (this.webglAddon) return Promise.resolve(true);
    if (this.webglLoad) return this.webglLoad;

    this.webglLoad = import('@xterm/addon-webgl')
      .then(({ WebglAddon: WebglAddonConstructor }) => {
        if (this.disposed || this.webglAddon) return !this.disposed;
        const addon = new WebglAddonConstructor();
        addon.onContextLoss(() => this.disableWebGL());
        this.terminal.loadAddon(addon);
        this.webglAddon = addon;
        return true;
      })
      .catch((error: unknown) => {
        console.warn('WebGL 不可用，已回退到 Canvas 渲染。', error);
        this.disableWebGL();
        return false;
      })
      .finally(() => {
        this.webglLoad = null;
      });
    return this.webglLoad;
  }

  public disableWebGL() {
    if (this.webglAddon) {
      try {
        this.webglAddon.dispose();
      } catch {
        /* ignore */
      }
      this.webglAddon = null;
    }
  }

  private bindInputOptimizations(container: HTMLElement) {
    container.addEventListener('click', this.handleContainerClick);

    setTimeout(() => {
      const helperTextarea = container.querySelector(
        '.xterm-helper-textarea'
      ) as HTMLTextAreaElement | null;
      if (helperTextarea) {
        helperTextarea.addEventListener('compositionstart', () => {
          this.isComposing = true;
        });
        helperTextarea.addEventListener('compositionend', () => {
          this.isComposing = false;
        });
      }
    }, 80);
  }

  public attachStream(stream: DuplexByteStream) {
    // Tear down previous stream if any
    this.detachStream();

    this.stream = stream;
    this.isConnected = true;
    this.readAbort = false;

    this.reader = stream.readable.getReader();
    this.writer = stream.writable.getWriter();

    // Frame batcher: merge high-frequency chunks to ~60fps without losing bytes
    this.batcher = new StreamFrameBatcher((chunk) => {
      this.terminal.write(chunk);
      this.appendLog(new TextDecoder().decode(chunk));
    });

    this.dataDisposable = this.terminal.onData((data) => {
      if (this.isComposing) return;
      if (this.writer && this.isConnected) {
        void this.writer.write(new TextEncoder().encode(data));
      }
    });

    void this.readLoop();
  }

  private detachStream() {
    this.readAbort = true;
    this.isConnected = false;
    this.batcher?.flushImmediately();
    this.batcher?.clear();
    this.batcher = null;

    if (this.dataDisposable) {
      this.dataDisposable.dispose();
      this.dataDisposable = null;
    }
    if (this.reader) {
      void this.reader.cancel().catch(() => {});
      this.reader = null;
    }
    if (this.writer) {
      void this.writer.close().catch(() => {});
      this.writer = null;
    }
    if (this.stream) {
      void this.stream.close().catch(() => {});
      this.stream = null;
    }
  }

  public writeInput(data: string) {
    if (this.writer && this.isConnected) {
      void this.writer.write(new TextEncoder().encode(data));
    }
  }

  public focus() {
    this.terminal.focus();
  }

  public get connected(): boolean {
    return this.isConnected;
  }

  private appendLog(text: string) {
    this.logBuffer.push(text);
    this.logChars += text.length;
    // Bound memory for long-running sessions
    while (this.logChars > MAX_LOG_CHARS && this.logBuffer.length > 1) {
      const removed = this.logBuffer.shift()!;
      this.logChars -= removed.length;
    }
  }

  private async readLoop() {
    if (!this.reader) return;
    try {
      while (this.isConnected && !this.readAbort) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value && this.batcher) {
          this.batcher.push(value);
        }
      }
    } catch (err) {
      if (!this.readAbort) {
        console.error('Terminal Stream read error:', err);
        this.terminal.writeln(
          `\r\n\x1b[1;31m[stream closed]\x1b[0m ${err instanceof Error ? err.message : String(err)}`
        );
      }
    } finally {
      this.batcher?.flushImmediately();
      this.isConnected = false;
    }
  }

  public exportLog(): string {
    return this.logBuffer.join('');
  }

  public resize() {
    try {
      this.fitAddon.fit();
    } catch {
      // ignore unmounted layout errors
    }
  }

  public setTheme(themeName: string) {
    if (TERMINAL_THEMES[themeName]) {
      this.terminal.options.theme = TERMINAL_THEMES[themeName];
    }
  }

  public dispose() {
    this.disposed = true;
    this.containerElement?.removeEventListener('click', this.handleContainerClick);
    this.detachStream();
    this.disableWebGL();
    this.terminal.dispose();
    this.containerElement = null;
  }
}
