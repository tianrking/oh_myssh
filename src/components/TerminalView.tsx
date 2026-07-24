import React, { useEffect, useRef, useState } from 'react';
import { TerminalEngine } from '../core/terminal/engine';
import { MockSocketTransport } from '../core/socket/transport';
import { connectSshShell, type SshShellSession } from '../core/ssh/client';
import { sessionRegistry, type SessionMode } from '../core/session/registry';
import { Palette, RefreshCw, Cpu, ShieldCheck, WifiOff, Zap } from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';

interface Props {
  tab: TabItem;
  /** Optional advanced bridge only — never required */
  relayUrl?: string;
  theme?: string;
  isActive?: boolean;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'webssh-gateway':
      return 'WebSSH Gateway';
    case 'direct':
      return 'SSH2 Direct';
    case 'optional-bridge':
      return 'SSH2 (Advanced)';
    case 'offline':
      return 'Offline Shell';
    default:
      return mode;
  }
}

function isOfflineHost(tab: TabItem): boolean {
  return (
    !!tab.forceOffline ||
    tab.host === 'offline.local' ||
    tab.host.includes('offline')
  );
}

export const TerminalView: React.FC<Props> = ({
  tab,
  relayUrl,
  theme = 'cyberpunk',
  isActive = true,
}) => {
  const containerRef1 = useRef<HTMLDivElement>(null);
  const containerRef2 = useRef<HTMLDivElement>(null);
  const engineRef1 = useRef<TerminalEngine | null>(null);
  const engineRef2 = useRef<TerminalEngine | null>(null);
  const sshRef = useRef<SshShellSession | null>(null);

  const [currentTheme, setCurrentTheme] = useState(theme);
  const [transportName, setTransportName] = useState('Connecting…');
  const [connectionMode, setConnectionMode] = useState<string>('connecting');
  const [connectedTime, setConnectedTime] = useState('');
  const [useWebGL, setUseWebGL] = useState(true);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [statusLine, setStatusLine] = useState('');

  useEffect(() => {
    if (theme && theme !== currentTheme) {
      setCurrentTheme(theme);
      engineRef1.current?.setTheme(theme);
      engineRef2.current?.setTheme(theme);
    }
  }, [theme]);

  useEffect(() => {
    if (isActive) {
      sessionRegistry.setActive(tab.id);
      requestAnimationFrame(() => {
        engineRef1.current?.resize();
        engineRef2.current?.resize();
        engineRef1.current?.focus();
      });
    }
  }, [isActive, tab.id]);

  useEffect(() => {
    let cancelled = false;
    setConnectedTime(new Date().toLocaleTimeString());
    setStatus('connecting');
    setStatusLine('');

    const engine1 = new TerminalEngine(currentTheme);
    engineRef1.current = engine1;
    if (containerRef1.current) {
      engine1.mount(containerRef1.current);
    }

    const register = (mode: SessionMode) => {
      sessionRegistry.register(tab.id, engine1, {
        mode,
        title: tab.title,
        host: `${tab.username}@${tab.host}:${tab.port}`,
      });
      if (isActive) sessionRegistry.setActive(tab.id);
    };

    const connectOffline = async (banner?: string) => {
      if (banner) engine1.terminal.writeln(banner);
      const offline = new MockSocketTransport();
      const stream = await offline.connect(tab.host, tab.port, tab.username);
      if (cancelled) return;
      engine1.attachStream(stream);
      setConnectionMode('offline');
      setTransportName(modeLabel('offline'));
      setStatus('connected');
      register('offline');
    };

    const showConnectError = (message: string) => {
      setStatus('error');
      setTransportName('SSH Failed');
      setConnectionMode('error');
      engine1.terminal.writeln('');
      engine1.terminal.writeln('\x1b[1;31m╔══════════════════════════════════════════════════════╗\x1b[0m');
      engine1.terminal.writeln('\x1b[1;31m║  SSH 连接失败                                        ║\x1b[0m');
      engine1.terminal.writeln('\x1b[1;31m╚══════════════════════════════════════════════════════╝\x1b[0m');
      engine1.terminal.writeln('');
      engine1.terminal.writeln(` \x1b[33m目标\x1b[0m  ${tab.username}@${tab.host}:${tab.port}`);
      engine1.terminal.writeln('');
      for (const line of message.split('\n')) {
        engine1.terminal.writeln(` ${line}`);
      }
      engine1.terminal.writeln('');
      engine1.terminal.writeln(
        ' \x1b[36m说明\x1b[0m  纯 Vercel 静态站 = 只有前端。真实 SSH 需要「有人」能拨 TCP。'
      );
      engine1.terminal.writeln(
        '       可先用侧边栏 \x1b[1m离线开发 Shell\x1b[0m 体验终端 UI。'
      );
      engine1.terminal.writeln('');
    };

    const connect = async () => {
      // Demo offline host only
      if (isOfflineHost(tab)) {
        await connectOffline();
        return;
      }

      // Xshell-style: require credentials for real VPS
      if (!tab.password && !tab.privateKey) {
        showConnectError(
          '未填写密码或私钥。\n请用「快速连接」输入 user@host:port 和密码后再连。'
        );
        return;
      }

      try {
        setStatusLine(`Connecting ${tab.username}@${tab.host}…`);
        const ssh = await connectSshShell({
          host: tab.host,
          port: tab.port,
          auth: {
            username: tab.username,
            password: tab.password,
            privateKeyPem: tab.privateKey,
          },
          // Default: WebSSH gateway. Advanced raw bridge only if user set it.
          relayUrl: relayUrl?.trim() || undefined,
          cols: 120,
          rows: 40,
          onStatus: (msg) => {
            if (!cancelled) setStatusLine(msg);
          },
        });

        if (cancelled) {
          await ssh.close();
          return;
        }

        sshRef.current = ssh;
        engine1.attachStream(ssh.stream);
        setConnectionMode(ssh.mode);
        setTransportName(modeLabel(ssh.mode));
        setStatus('connected');
        setStatusLine('');
        register(
          ssh.mode === 'webssh-gateway'
            ? 'relay'
            : ssh.mode === 'direct'
              ? 'direct'
              : 'relay'
        );

        const fitResize = () => {
          try {
            engine1.resize();
            ssh.resize(engine1.terminal.cols, engine1.terminal.rows);
          } catch {
            /* ignore */
          }
        };
        window.addEventListener('resize', fitResize);
        (ssh as unknown as { _fitResize: () => void })._fitResize = fitResize;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        showConnectError(message);
        // Do NOT auto-fallback to offline — keep Xshell-like fail semantics
      }
    };

    void connect();

    const handleResize = () => {
      engine1.resize();
      const ssh = sshRef.current;
      if (ssh) {
        try {
          ssh.resize(engine1.terminal.cols, engine1.terminal.rows);
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      const ssh = sshRef.current as (SshShellSession & { _fitResize?: () => void }) | null;
      if (ssh?._fitResize) {
        window.removeEventListener('resize', ssh._fitResize);
      }
      void sshRef.current?.close();
      sshRef.current = null;
      sessionRegistry.unregister(tab.id);
      engine1.dispose();
      engineRef1.current = null;
    };
  }, [tab.id, tab.host, tab.port, tab.username, tab.password, tab.privateKey, tab.forceOffline, relayUrl]);

  useEffect(() => {
    if (tab.splitMode && tab.splitMode !== 'none') {
      const engine2 = new TerminalEngine(currentTheme);
      engineRef2.current = engine2;
      if (containerRef2.current) engine2.mount(containerRef2.current);
      const offline = new MockSocketTransport();
      offline.connect(tab.host, tab.port, tab.username).then((s) => engine2.attachStream(s));
      return () => {
        engine2.dispose();
        engineRef2.current = null;
      };
    }
  }, [tab.splitMode, tab.id, tab.host, tab.port, tab.username]);

  useEffect(() => {
    requestAnimationFrame(() => {
      engineRef1.current?.resize();
      engineRef2.current?.resize();
    });
  }, [tab.splitMode]);

  const handleThemeChange = (themeName: string) => {
    setCurrentTheme(themeName);
    engineRef1.current?.setTheme(themeName);
    engineRef2.current?.setTheme(themeName);
  };

  const handleRendererToggle = () => {
    const next = !useWebGL;
    setUseWebGL(next);
    if (next) {
      engineRef1.current?.enableWebGL();
      engineRef2.current?.enableWebGL();
    } else {
      engineRef1.current?.disableWebGL();
      engineRef2.current?.disableWebGL();
    }
  };

  const statusColor =
    status === 'connected'
      ? connectionMode === 'offline'
        ? 'text-amber-400'
        : 'text-emerald-400'
      : status === 'error'
        ? 'text-rose-400'
        : 'text-cyan-400';

  return (
    <div className="flex h-full w-full flex-col bg-slate-950">
      <div
        className={`flex-1 overflow-hidden p-1.5 ${
          tab.splitMode === 'vertical'
            ? 'flex flex-row divide-x divide-slate-800'
            : tab.splitMode === 'horizontal'
              ? 'flex flex-col divide-y divide-slate-800'
              : 'block'
        }`}
      >
        <div
          ref={containerRef1}
          className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner cursor-text"
        />
        {tab.splitMode && tab.splitMode !== 'none' && (
          <div
            ref={containerRef2}
            className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner cursor-text"
          />
        )}
      </div>

      <div className="flex h-7 items-center justify-between border-t border-slate-800/80 bg-slate-950 px-3 text-[11px] text-slate-400 font-mono select-none">
        <div className="flex items-center gap-4 min-w-0">
          <span className={`flex items-center gap-1.5 shrink-0 ${statusColor}`}>
            {connectionMode === 'offline' ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : status === 'connected' ? (
              <Zap className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span>{transportName}</span>
          </span>

          <button
            onClick={handleRendererToggle}
            className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors shrink-0"
          >
            <Cpu className={`h-3.5 w-3.5 ${useWebGL ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{useWebGL ? 'WebGL' : 'Canvas'}</span>
          </button>

          <span className="hidden md:inline text-slate-500 truncate">
            {tab.username}@{tab.host}:{tab.port}
            {connectedTime ? ` · ${connectedTime}` : ''}
            {statusLine ? ` · ${statusLine}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1">
            <Palette className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="bg-transparent text-[11px] text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="cyberpunk" className="bg-slate-900">
                Cyberpunk
              </option>
              <option value="oneDark" className="bg-slate-900">
                One Dark
              </option>
              <option value="dracula" className="bg-slate-900">
                Dracula
              </option>
              <option value="monokai" className="bg-slate-900">
                Monokai
              </option>
              <option value="xshellClassic" className="bg-slate-900">
                Xshell Classic
              </option>
            </select>
          </div>
          <button
            onClick={() => {
              engineRef1.current?.resize();
              engineRef1.current?.focus();
              const ssh = sshRef.current;
              if (ssh && engineRef1.current) {
                ssh.resize(engineRef1.current.terminal.cols, engineRef1.current.terminal.rows);
              }
            }}
            className="flex items-center gap-1 hover:text-cyan-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Fit</span>
          </button>
        </div>
      </div>
    </div>
  );
};
