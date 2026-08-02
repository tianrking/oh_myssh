/**
 * High-performance offline interactive shell (Xshell-like demo runtime).
 * Virtual FS + readline editing + common devops commands for pure offline use.
 */

export type OfflineShellOptions = {
  host: string;
  port: number;
  username?: string;
};

type DirNode = { type: 'dir'; children: Record<string, FsNode> };
type FileNode = { type: 'file'; content: string; mode: string };
type FsNode = DirNode | FileNode;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function makeDir(children: Record<string, FsNode> = {}): DirNode {
  return { type: 'dir', children };
}

function makeFile(content: string, mode = '-rw-r--r--'): FileNode {
  return { type: 'file', content, mode };
}

function buildDefaultFs(username: string, host: string): DirNode {
  return makeDir({
    home: makeDir({
      [username]: makeDir({
        projects: makeDir({
          'oh-myssh': makeDir({
            'README.md': makeFile(
              '# Oh My SSH\nLocal-first pure frontend SSH workspace.\n',
              '-rw-r--r--'
            ),
            'package.json': makeFile(
              '{\n  "name": "demo-app",\n  "version": "1.0.0"\n}\n'
            ),
            src: makeDir({
              'main.ts': makeFile('console.log("hello from offline shell");\n'),
            }),
          }),
          'api-service': makeDir({
            'docker-compose.yml': makeFile(
              'version: "3.9"\nservices:\n  api:\n    image: node:20\n    ports:\n      - "3000:3000"\n'
            ),
          }),
        }),
        scripts: makeDir({
          'deploy.sh': makeFile(
            '#!/usr/bin/env bash\nset -euo pipefail\necho "deploying..."\n',
            '-rwxr-xr-x'
          ),
        }),
        '.bashrc': makeFile('export PATH=$PATH:/usr/local/bin\n'),
        '.profile': makeFile('# offline profile\n'),
        'notes.txt': makeFile('Dev notes for offline shell session.\n'),
      }),
    }),
    root: makeDir({
      '.ssh': makeDir({
        authorized_keys: makeFile('ssh-ed25519 AAAA... offline-demo\n', '-rw-------'),
      }),
    }),
    etc: makeDir({
      hostname: makeFile(`${host}\n`),
      hosts: makeFile('127.0.0.1 localhost\n'),
      os_release: makeFile(
        'NAME="Oh My SSH Offline OS"\nVERSION="1.0"\nID=ohmyssh\n'
      ),
      passwd: makeFile(
        `${username}:x:1000:1000:Developer:/home/${username}:/bin/zsh\nroot:x:0:0:root:/root:/bin/bash\n`
      ),
    }),
    var: makeDir({
      log: makeDir({
        syslog: makeFile('Jul 24 11:00:00 kernel: Oh My SSH offline runtime ready\n'),
        nginx: makeDir({
          'access.log': makeFile('127.0.0.1 - - [24/Jul/2026] "GET / HTTP/1.1" 200\n'),
        }),
      }),
      www: makeDir({
        html: makeDir({
          'index.html': makeFile('<!doctype html><title>Offline</title><h1>OK</h1>\n'),
        }),
      }),
    }),
    tmp: makeDir({}),
    usr: makeDir({
      bin: makeDir({}),
      local: makeDir({ bin: makeDir({}) }),
    }),
  });
}

export class OfflineShellEngine {
  private host: string;
  private port: number;
  private username: string;
  private cwd: string[];
  private env: Record<string, string>;
  private history: string[] = [];
  private historyIndex = -1;
  private lineBuffer = '';
  private cursor = 0;
  private fs: DirNode;
  private controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  private closed = false;

  constructor(opts: OfflineShellOptions) {
    this.host = opts.host;
    this.port = opts.port;
    this.username = opts.username || 'root';
    this.cwd = this.username === 'root' ? ['root'] : ['home', this.username];
    this.env = {
      USER: this.username,
      HOME: this.username === 'root' ? '/root' : `/home/${this.username}`,
      SHELL: '/bin/zsh',
      TERM: 'xterm-256color',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      PWD: this.pwd(),
      LANG: 'en_US.UTF-8',
      HOSTNAME: this.host,
    };
    this.fs = buildDefaultFs(this.username, this.host);
  }

  createStream(): {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
    close: () => Promise<void>;
  } {
    const self = this;
    const readable = new ReadableStream<Uint8Array>({
      start(ctrl) {
        self.controller = ctrl;
        queueMicrotask(() => self.bootBanner());
      },
      cancel() {
        self.closed = true;
      },
    });

    const writable = new WritableStream<Uint8Array>({
      write(chunk) {
        self.onInput(decoder.decode(chunk));
      },
      close() {
        self.closed = true;
      },
    });

    return {
      readable,
      writable,
      close: async () => {
        self.closed = true;
        try {
          self.controller?.close();
        } catch {
          /* already closed */
        }
      },
    };
  }

  private send(text: string) {
    if (this.closed || !this.controller) return;
    this.controller.enqueue(encoder.encode(text));
  }

  private sendLine(text = '') {
    this.send(text + '\r\n');
  }

  private prompt() {
    const path = this.pwd();
    const short =
      path === this.env.HOME ? '~' : path.replace(this.env.HOME + '/', '~/');
    const userColor = this.username === 'root' ? '1;31' : '1;32';
    this.send(
      `\x1b[${userColor}m${this.username}@${this.host}\x1b[0m:\x1b[1;34m${short}\x1b[0m${this.username === 'root' ? '#' : '$'} `
    );
  }

  private bootBanner() {
    // Single write for lower latency and atomic first-frame banner
    const lines = [
      '\x1b[1;36m╔════════════════════════════════════════════════════════════╗\x1b[0m',
      '\x1b[1;36m║\x1b[0m  \x1b[1;32mOh My SSH · Offline Interactive Shell\x1b[0m                     \x1b[1;36m║\x1b[0m',
      '\x1b[1;36m║\x1b[0m  High-performance local runtime for pure web offline use  \x1b[1;36m║\x1b[0m',
      '\x1b[1;36m╚════════════════════════════════════════════════════════════╝\x1b[0m',
      ` Connected: \x1b[33m${this.username}@${this.host}:${this.port}\x1b[0m`,
      ` Mode: \x1b[36mOffline Shell\x1b[0m (no remote TCP — fully local)`,
      ` Tip: type \x1b[1;33mhelp\x1b[0m · real SSH needs DirectSockets IWA or Relay`,
      '',
    ];
    this.send(lines.join('\r\n') + '\r\n');
    this.prompt();
  }

  private pwd(): string {
    return '/' + this.cwd.join('/');
  }

  private resolvePath(input: string): string[] {
    let parts: string[];
    if (input.startsWith('/')) {
      parts = input.split('/').filter(Boolean);
    } else if (input === '~' || input.startsWith('~/')) {
      const home = this.env.HOME.split('/').filter(Boolean);
      const rest = input === '~' ? [] : input.slice(2).split('/').filter(Boolean);
      parts = [...home, ...rest];
    } else {
      parts = [...this.cwd, ...input.split('/').filter(Boolean)];
    }
    const stack: string[] = [];
    for (const p of parts) {
      if (p === '.' || p === '') continue;
      if (p === '..') stack.pop();
      else stack.push(p);
    }
    return stack;
  }

  private getNode(pathParts: string[]): FsNode | null {
    if (pathParts.length === 0) return this.fs;
    let current: DirNode | FileNode = this.fs;
    for (const part of pathParts) {
      if (current.type !== 'dir') return null;
      const dir: DirNode = current;
      const child = dir.children[part];
      if (child === undefined) return null;
      current = child;
    }
    return current;
  }

  private ensureParent(pathParts: string[]): DirNode | null {
    if (pathParts.length === 0) return this.fs;
    const parent = this.getNode(pathParts.slice(0, -1));
    if (!parent || parent.type !== 'dir') return null;
    return parent;
  }

  private onInput(text: string) {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const code = ch.charCodeAt(0);

      // Escape sequences (arrows, etc.)
      if (ch === '\x1b') {
        const seq = text.slice(i, i + 3);
        if (seq === '\x1b[A') {
          this.historyUp();
          i += 3;
          continue;
        }
        if (seq === '\x1b[B') {
          this.historyDown();
          i += 3;
          continue;
        }
        if (seq === '\x1b[C') {
          this.cursorRight();
          i += 3;
          continue;
        }
        if (seq === '\x1b[D') {
          this.cursorLeft();
          i += 3;
          continue;
        }
        // skip unknown CSI
        i += 1;
        continue;
      }

      if (ch === '\r' || ch === '\n') {
        this.send('\r\n');
        const cmd = this.lineBuffer;
        this.lineBuffer = '';
        this.cursor = 0;
        this.runCommand(cmd.trim());
        i += 1;
        continue;
      }

      if (code === 127 || code === 8) {
        this.backspace();
        i += 1;
        continue;
      }

      if (code === 3) {
        // Ctrl+C
        this.lineBuffer = '';
        this.cursor = 0;
        this.sendLine('^C');
        this.prompt();
        i += 1;
        continue;
      }

      if (code === 12) {
        // Ctrl+L
        this.lineBuffer = '';
        this.cursor = 0;
        this.send('\x1b[2J\x1b[H');
        this.prompt();
        i += 1;
        continue;
      }

      if (code === 21) {
        // Ctrl+U clear line
        this.clearLineVisual();
        this.lineBuffer = '';
        this.cursor = 0;
        i += 1;
        continue;
      }

      if (code === 23) {
        // Ctrl+W delete word
        this.deleteWord();
        i += 1;
        continue;
      }

      if (ch === '\t') {
        this.tabComplete();
        i += 1;
        continue;
      }

      // printable
      if (code >= 32) {
        this.insertChar(ch);
      }
      i += 1;
    }
  }

  private clearLineVisual() {
    // move cursor to end then erase line content visually
    const after = this.lineBuffer.length - this.cursor;
    if (after > 0) this.send('\x1b[' + after + 'C');
    for (let i = 0; i < this.lineBuffer.length; i++) this.send('\b \b');
  }

  private redrawLine() {
    this.clearLineVisual();
    this.send(this.lineBuffer);
    const back = this.lineBuffer.length - this.cursor;
    if (back > 0) this.send('\x1b[' + back + 'D');
  }

  private insertChar(ch: string) {
    this.lineBuffer =
      this.lineBuffer.slice(0, this.cursor) + ch + this.lineBuffer.slice(this.cursor);
    this.cursor += 1;
    this.redrawLine();
  }

  private backspace() {
    if (this.cursor === 0) return;
    this.lineBuffer =
      this.lineBuffer.slice(0, this.cursor - 1) + this.lineBuffer.slice(this.cursor);
    this.cursor -= 1;
    this.redrawLine();
  }

  private deleteWord() {
    if (this.cursor === 0) return;
    let i = this.cursor - 1;
    while (i >= 0 && this.lineBuffer[i] === ' ') i--;
    while (i >= 0 && this.lineBuffer[i] !== ' ') i--;
    this.lineBuffer =
      this.lineBuffer.slice(0, i + 1) + this.lineBuffer.slice(this.cursor);
    this.cursor = i + 1;
    this.redrawLine();
  }

  private cursorLeft() {
    if (this.cursor === 0) return;
    this.cursor -= 1;
    this.send('\x1b[D');
  }

  private cursorRight() {
    if (this.cursor >= this.lineBuffer.length) return;
    this.cursor += 1;
    this.send('\x1b[C');
  }

  private historyUp() {
    if (this.history.length === 0) return;
    if (this.historyIndex < 0) this.historyIndex = this.history.length;
    if (this.historyIndex > 0) this.historyIndex -= 1;
    this.lineBuffer = this.history[this.historyIndex] || '';
    this.cursor = this.lineBuffer.length;
    this.redrawLine();
  }

  private historyDown() {
    if (this.historyIndex < 0) return;
    this.historyIndex += 1;
    if (this.historyIndex >= this.history.length) {
      this.historyIndex = this.history.length;
      this.lineBuffer = '';
    } else {
      this.lineBuffer = this.history[this.historyIndex] || '';
    }
    this.cursor = this.lineBuffer.length;
    this.redrawLine();
  }

  private tabComplete() {
    const parts = this.lineBuffer.split(/\s+/);
    const last = parts[parts.length - 1] || '';
    if (parts.length === 1) {
      const cmds = Object.keys(COMMAND_HELP);
      const matches = cmds.filter((c) => c.startsWith(last));
      if (matches.length === 1) {
        this.lineBuffer = matches[0] + ' ';
        this.cursor = this.lineBuffer.length;
        this.redrawLine();
      } else if (matches.length > 1) {
        this.sendLine('');
        this.sendLine(matches.join('  '));
        this.prompt();
        this.send(this.lineBuffer);
      }
      return;
    }
    // path complete
    const pathParts = this.resolvePath(last);
    const baseName = last.endsWith('/') ? '' : pathParts.pop() || '';
    const dirNode = this.getNode(pathParts);
    if (!dirNode || dirNode.type !== 'dir') return;
    const names = Object.keys(dirNode.children).filter((n) => n.startsWith(baseName));
    if (names.length === 1) {
      const full = names[0];
      const node = dirNode.children[full];
      const prefix = last.endsWith('/')
        ? last
        : last.slice(0, last.length - baseName.length);
      const completed = prefix + full + (node.type === 'dir' ? '/' : ' ');
      parts[parts.length - 1] = completed;
      this.lineBuffer = parts.join(' ');
      this.cursor = this.lineBuffer.length;
      this.redrawLine();
    } else if (names.length > 1) {
      this.sendLine('');
      this.sendLine(names.join('  '));
      this.prompt();
      this.send(this.lineBuffer);
    }
  }

  private runCommand(raw: string) {
    if (raw.length > 0) {
      this.history.push(raw);
      this.historyIndex = -1;
    }

    if (!raw) {
      this.prompt();
      return;
    }

    // support simple env assignment: FOO=bar
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(raw) && !raw.includes(' ')) {
      const eq = raw.indexOf('=');
      this.env[raw.slice(0, eq)] = raw.slice(eq + 1);
      this.prompt();
      return;
    }

    const tokens = this.tokenize(raw);
    const cmd = tokens[0];
    const args = tokens.slice(1);

    try {
      switch (cmd) {
        case 'help':
          this.cmdHelp(args);
          break;
        case 'clear':
          this.send('\x1b[2J\x1b[H');
          break;
        case 'pwd':
          this.sendLine(this.pwd());
          break;
        case 'cd':
          this.cmdCd(args);
          break;
        case 'ls':
        case 'll':
          this.cmdLs(args, cmd === 'll');
          break;
        case 'cat':
          this.cmdCat(args);
          break;
        case 'echo':
          this.cmdEcho(args);
          break;
        case 'whoami':
          this.sendLine(this.username);
          break;
        case 'hostname':
          this.sendLine(this.host);
          break;
        case 'uname':
          this.sendLine(
            args.includes('-a')
              ? `Linux ${this.host} 6.8.0-ohmyssh #1 SMP x86_64 GNU/Linux`
              : 'Linux'
          );
          break;
        case 'date':
          this.sendLine(new Date().toString());
          break;
        case 'env':
        case 'printenv':
          Object.entries(this.env)
            .sort(([a], [b]) => a.localeCompare(b))
            .forEach(([k, v]) => this.sendLine(`${k}=${v}`));
          break;
        case 'export':
          this.cmdExport(args);
          break;
        case 'history':
          this.history.forEach((h, i) => this.sendLine(`  ${i + 1}  ${h}`));
          break;
        case 'mkdir':
          this.cmdMkdir(args);
          break;
        case 'touch':
          this.cmdTouch(args);
          break;
        case 'rm':
          this.cmdRm(args);
          break;
        case 'tree':
          this.cmdTree(args);
          break;
        case 'neofetch':
          this.cmdNeofetch();
          break;
        case 'id':
          this.sendLine(
            `uid=1000(${this.username}) gid=1000(${this.username}) groups=1000(${this.username}),27(sudo)`
          );
          break;
        case 'uptime':
          this.sendLine(
            ` ${new Date().toTimeString().slice(0, 8)} up 42 days,  3:14,  1 user,  load average: 0.08, 0.12, 0.09`
          );
          break;
        case 'free':
          this.sendLine('               total        used        free      shared  buff/cache   available');
          this.sendLine('Mem:         16384000     3200000    10800000      120000     2384000    12500000');
          this.sendLine('Swap:         4096000           0     4096000');
          break;
        case 'df':
          this.sendLine('Filesystem     1K-blocks    Used Available Use% Mounted on');
          this.sendLine('/dev/vda1      104857600 18874368  80855040  19% /');
          this.sendLine('tmpfs            8192000        0   8192000   0% /tmp');
          break;
        case 'ps':
          this.sendLine('  PID TTY          TIME CMD');
          this.sendLine('    1 ?        00:00:01 systemd');
          this.sendLine('  128 ?        00:00:00 sshd');
          this.sendLine('  512 pts/0    00:00:00 zsh');
          this.sendLine(`  888 pts/0    00:00:00 ${cmd}`);
          break;
        case 'top':
        case 'htop':
          this.sendLine('\x1b[1;36mTasks:\x1b[0m 42 total, 1 running · \x1b[1;36mMem:\x1b[0m 3.2G/16G · Offline snapshot');
          this.sendLine('  PID USER      %CPU %MEM    TIME+ COMMAND');
          this.sendLine('    1 root       0.0  0.1  0:01.02 systemd');
          this.sendLine('  128 root       0.1  0.2  0:00.40 sshd');
          this.sendLine(`  512 ${this.username.padEnd(8)} 0.2  0.3  0:00.12 zsh`);
          break;
        case 'docker':
          this.cmdDocker(args);
          break;
        case 'git':
          this.cmdGit(args);
          break;
        case 'curl':
        case 'wget':
          this.sendLine(
            args[0]
              ? `Offline mock: fetched ${args[args.length - 1]} (200 OK, 1.2KB)`
              : `${cmd}: missing URL`
          );
          break;
        case 'ping':
          this.cmdPing(args);
          break;
        case 'ssh':
          this.sendLine(
            'Offline shell cannot open nested real SSH. Configure Relay or use DirectSockets IWA.'
          );
          break;
        case 'exit':
        case 'logout':
          this.sendLine('Session closed (offline shell keeps tab open — reconnect to restart).');
          break;
        default:
          this.sendLine(`zsh: command not found: ${cmd}`);
          this.sendLine(`type \x1b[33mhelp\x1b[0m for available commands`);
      }
    } catch (err: any) {
      this.sendLine(`error: ${err?.message || err}`);
    }

    this.env.PWD = this.pwd();
    this.prompt();
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let cur = '';
    let quote: '"' | "'" | null = null;
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (quote) {
        if (ch === quote) quote = null;
        else cur += ch;
        continue;
      }
      if (ch === '"' || ch === "'") {
        quote = ch;
        continue;
      }
      if (ch === ' ' || ch === '\t') {
        if (cur) {
          tokens.push(cur);
          cur = '';
        }
        continue;
      }
      cur += ch;
    }
    if (cur) tokens.push(cur);
    return tokens.map((t) => this.expand(t));
  }

  private expand(token: string): string {
    if (token.startsWith('~')) {
      return token.replace(/^~/, this.env.HOME);
    }
    return token.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, k) => this.env[k] ?? '');
  }

  private cmdHelp(args: string[]) {
    if (args[0] && COMMAND_HELP[args[0]]) {
      this.sendLine(`${args[0]} — ${COMMAND_HELP[args[0]]}`);
      return;
    }
    const lines = [
      '\x1b[1;33mOh My SSH Offline Shell — command reference\x1b[0m',
      '',
      ...Object.entries(COMMAND_HELP).map(
        ([name, desc]) => `  \x1b[36m${name.padEnd(12)}\x1b[0m ${desc}`
      ),
      '',
      'Readline: ↑↓ history · ←→ cursor · Tab complete · Ctrl+C/L/U/W',
    ];
    this.send(lines.join('\r\n') + '\r\n');
  }

  private cmdCd(args: string[]) {
    const target = args[0] || this.env.HOME;
    const parts = this.resolvePath(target);
    if (parts.length === 0) {
      // root
      const node = this.fs;
      if (node.type === 'dir') {
        this.cwd = [];
        return;
      }
    }
    const node = this.getNode(parts);
    if (!node) {
      this.sendLine(`cd: no such file or directory: ${target}`);
      return;
    }
    if (node.type !== 'dir') {
      this.sendLine(`cd: not a directory: ${target}`);
      return;
    }
    this.cwd = parts;
  }

  private cmdLs(args: string[], long: boolean) {
    const target = args.find((a) => !a.startsWith('-')) || '.';
    const parts = this.resolvePath(target);
    const node = this.getNode(parts);
    if (!node) {
      this.sendLine(`ls: cannot access '${target}': No such file or directory`);
      return;
    }
    if (node.type === 'file') {
      this.sendLine(target.split('/').pop() || target);
      return;
    }
    const names = Object.keys(node.children).sort();
    if (long || args.includes('-l')) {
      for (const name of names) {
        const child = node.children[name];
        if (child.type === 'dir') {
          this.sendLine(`drwxr-xr-x  2 ${this.username} ${this.username} 4096 Jul 24 11:00 \x1b[1;34m${name}\x1b[0m`);
        } else {
          const exec = child.mode.includes('x');
          const color = exec ? '\x1b[1;32m' : '';
          const reset = exec ? '\x1b[0m' : '';
          this.sendLine(
            `${child.mode}  1 ${this.username} ${this.username} ${String(child.content.length).padStart(4)} Jul 24 11:00 ${color}${name}${reset}`
          );
        }
      }
    } else {
      const colored = names.map((name) => {
        const child = node.children[name];
        if (child.type === 'dir') return `\x1b[1;34m${name}\x1b[0m`;
        if (child.type === 'file' && child.mode.includes('x')) return `\x1b[1;32m${name}\x1b[0m`;
        return name;
      });
      this.sendLine(colored.join('  '));
    }
  }

  private cmdCat(args: string[]) {
    if (args.length === 0) {
      this.sendLine('cat: missing file operand');
      return;
    }
    for (const f of args) {
      const node = this.getNode(this.resolvePath(f));
      if (!node) {
        this.sendLine(`cat: ${f}: No such file or directory`);
        continue;
      }
      if (node.type === 'dir') {
        this.sendLine(`cat: ${f}: Is a directory`);
        continue;
      }
      for (const line of node.content.split('\n')) {
        this.sendLine(line);
      }
    }
  }

  private cmdEcho(args: string[]) {
    this.sendLine(args.join(' '));
  }

  private cmdExport(args: string[]) {
    if (args.length === 0) {
      Object.entries(this.env).forEach(([k, v]) => this.sendLine(`export ${k}="${v}"`));
      return;
    }
    for (const a of args) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        this.env[a.slice(0, eq)] = a.slice(eq + 1);
      }
    }
  }

  private cmdMkdir(args: string[]) {
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      this.sendLine('mkdir: missing operand');
      return;
    }
    for (const t of targets) {
      const parts = this.resolvePath(t);
      const name = parts[parts.length - 1];
      const parent = this.ensureParent(parts);
      if (!parent) {
        this.sendLine(`mkdir: cannot create directory '${t}': No such file or directory`);
        continue;
      }
      if (parent.children[name]) {
        this.sendLine(`mkdir: cannot create directory '${t}': File exists`);
        continue;
      }
      parent.children[name] = makeDir();
    }
  }

  private cmdTouch(args: string[]) {
    if (args.length === 0) {
      this.sendLine('touch: missing file operand');
      return;
    }
    for (const t of args) {
      const parts = this.resolvePath(t);
      const name = parts[parts.length - 1];
      const parent = this.ensureParent(parts);
      if (!parent) {
        this.sendLine(`touch: cannot touch '${t}': No such file or directory`);
        continue;
      }
      if (!parent.children[name]) {
        parent.children[name] = makeFile('');
      }
    }
  }

  private cmdRm(args: string[]) {
    const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
    const targets = args.filter((a) => !a.startsWith('-'));
    if (targets.length === 0) {
      this.sendLine('rm: missing operand');
      return;
    }
    for (const t of targets) {
      const parts = this.resolvePath(t);
      const name = parts[parts.length - 1];
      const parent = this.ensureParent(parts);
      if (!parent || !parent.children[name]) {
        this.sendLine(`rm: cannot remove '${t}': No such file or directory`);
        continue;
      }
      const node = parent.children[name];
      if (node.type === 'dir' && !recursive) {
        this.sendLine(`rm: cannot remove '${t}': Is a directory`);
        continue;
      }
      delete parent.children[name];
    }
  }

  private cmdTree(args: string[]) {
    const target = args[0] || '.';
    const parts = this.resolvePath(target);
    const node = this.getNode(parts);
    if (!node) {
      this.sendLine(`tree: ${target}: No such file or directory`);
      return;
    }
    this.sendLine(target === '.' ? this.pwd() : target);
    if (node.type === 'dir') this.printTree(node, '');
  }

  private printTree(node: DirNode, prefix: string) {
    const names = Object.keys(node.children).sort();
    names.forEach((name, idx) => {
      const last = idx === names.length - 1;
      const branch = last ? '└── ' : '├── ';
      const child = node.children[name];
      this.sendLine(
        prefix +
          branch +
          (child.type === 'dir' ? `\x1b[1;34m${name}\x1b[0m` : name)
      );
      if (child.type === 'dir') {
        this.printTree(child, prefix + (last ? '    ' : '│   '));
      }
    });
  }

  private cmdNeofetch() {
    const logo = [
      '  \x1b[1;36m  ____  __  __ ____  \x1b[0m',
      '  \x1b[1;36m / __ \\|  \\/  / ___| \x1b[0m',
      '  \x1b[1;36m| |  | | |\\/| \\___ \\ \x1b[0m',
      '  \x1b[1;36m| |__| | |  | |___) |\x1b[0m',
      '  \x1b[1;36m \\____/|_|  |_|____/ \x1b[0m',
    ];
    const info = [
      `\x1b[1;33m${this.username}@${this.host}\x1b[0m`,
      '----------------------',
      'OS: Oh My SSH Offline OS',
      'Kernel: WASM Shell 2.0',
      'Shell: zsh 5.9 (offline)',
      'Terminal: xterm.js Canvas (WebGL optional)',
      'CPU: Browser V8 / JSCore',
      'Memory: Managed heap',
      `Uptime: session active`,
    ];
    for (let i = 0; i < Math.max(logo.length, info.length); i++) {
      const l = logo[i] || '                      ';
      const r = info[i] || '';
      this.sendLine(`${l}  ${r}`);
    }
  }

  private cmdDocker(args: string[]) {
    const sub = args[0] || 'help';
    if (sub === 'ps' || (sub === 'container' && args[1] === 'ls')) {
      this.sendLine('CONTAINER ID   IMAGE          STATUS         PORTS                    NAMES');
      this.sendLine('a1b2c3d4e5f6   nginx:alpine   Up 2 days      0.0.0.0:80->80/tcp       web');
      this.sendLine('f6e5d4c3b2a1   redis:7        Up 2 days      0.0.0.0:6379->6379/tcp   cache');
      return;
    }
    if (sub === 'images') {
      this.sendLine('REPOSITORY   TAG       IMAGE ID       CREATED       SIZE');
      this.sendLine('nginx        alpine    9beeba249f3e   2 weeks ago   42MB');
      this.sendLine('redis        7         e1f5c4b3a2d1   3 weeks ago   117MB');
      return;
    }
    this.sendLine('Offline docker mock: try `docker ps` or `docker images`');
  }

  private cmdGit(args: string[]) {
    const sub = args[0] || 'status';
    if (sub === 'status') {
      this.sendLine('On branch main');
      this.sendLine('Your branch is up to date with \'origin/main\'.');
      this.sendLine('');
      this.sendLine('nothing to commit, working tree clean');
      return;
    }
    if (sub === 'log') {
      this.sendLine('\x1b[33mcommit a1b2c3d (HEAD -> main)\x1b[0m');
      this.sendLine('Author: Offline Dev <dev@ohmyssh.local>');
      this.sendLine('Date:   Fri Jul 24 11:00:00 2026 +0800');
      this.sendLine('');
      this.sendLine('    feat: offline shell performance pass');
      return;
    }
    if (sub === 'branch') {
      this.sendLine('* main');
      this.sendLine('  develop');
      return;
    }
    this.sendLine(`git: '${sub}' offline mock — try status|log|branch`);
  }

  private cmdPing(args: string[]) {
    const target = args[0] || this.host;
    this.sendLine(`PING ${target} (127.0.0.1): 56 data bytes`);
    for (let i = 0; i < 4; i++) {
      this.sendLine(
        `64 bytes from 127.0.0.1: icmp_seq=${i} ttl=64 time=${(0.2 + Math.random()).toFixed(2)} ms`
      );
    }
    this.sendLine(`--- ${target} ping statistics ---`);
    this.sendLine('4 packets transmitted, 4 packets received, 0.0% packet loss');
  }
}

const COMMAND_HELP: Record<string, string> = {
  help: 'Show this reference',
  clear: 'Clear the screen',
  pwd: 'Print working directory',
  cd: 'Change directory',
  ls: 'List directory contents',
  ll: 'Long listing (ls -l)',
  cat: 'Print file contents',
  echo: 'Print arguments',
  mkdir: 'Create directory',
  touch: 'Create empty file',
  rm: 'Remove file/dir (-r recursive)',
  tree: 'Show directory tree',
  whoami: 'Current user',
  hostname: 'Host name',
  uname: 'Kernel info (-a full)',
  date: 'Current date/time',
  env: 'Environment variables',
  export: 'Set environment variable',
  history: 'Command history',
  neofetch: 'System overview',
  id: 'User identity',
  uptime: 'System uptime',
  free: 'Memory usage',
  df: 'Disk usage',
  ps: 'Process list',
  top: 'Process snapshot',
  htop: 'Process snapshot',
  docker: 'Mock docker ps/images',
  git: 'Mock git status/log/branch',
  curl: 'Mock HTTP fetch',
  wget: 'Mock HTTP fetch',
  ping: 'Mock ICMP ping',
  ssh: 'Explain real SSH requirements',
  exit: 'End offline session banner',
};
