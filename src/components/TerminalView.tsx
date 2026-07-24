import React, { useEffect, useRef, useState } from 'react';
import { TerminalEngine } from '../core/terminal/engine';
import { MockSocketTransport, type ConnectionMode } from '../core/socket/transport';
import { connectSshShell, type SshShellSession } from '../core/ssh/client';
import { sessionRegistry, type SessionMode } from '../core/session/registry';
import { Palette, RefreshCw, Cpu, ShieldCheck, WifiOff, Link2, Zap } from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';

interface Props {
  tab: TabItem;
  relayUrl?: string;
  theme?: string;
  isActive?: boolean;
}

function modeLabel(mode: string): string {
  switch (mode) {
    case 'direct':
      return 'Direct Sockets + SSH2';
    case 'relay':
      return 'Relay + SSH2';
    case 'local-relay':
      return 'Local WS→TCP + SSH2';
    case 'offline':
      return 'Offline Interactive Shell';
    default:
      return mode;
  }
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
  const [connectionMode, setConnectionMode] = useState<string>('offline');
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

    const connectOffline = async (reason?: string) => {
      if (reason) {
        engine1.terminal.writeln(`\x1b[33m${reason}\x1b[0m\r\n`);
      }
      const offline = new MockSocketTransport();
      const stream = await offline.connect(tab.host, tab.port, tab.username);
      if (cancelled) return;
      engine1.attachStream(stream);
      setConnectionMode('offline');
      setTransportName(modeLabel('offline'));
      setStatus('connected');
      register('offline');
    };

    const connect = async () => {
      // Explicit offline demo hosts / flag
      if (
        tab.forceOffline ||
        tab.host === 'offline.local' ||
        tab.host.includes('offline')
      ) {
        await connectOffline();
        return;
      }

      // No credentials → offline with hint (still usable)
      if (!tab.password && !tab.privateKey) {
        await connectOffline(
          '未提供密码/私钥 — 进入 Offline Shell。在快速连接中填写密码以使用真实 SSH。'
        );
        return;
      }

      try {
        const ssh = await connectSshShell({
          host: tab.host,
          port: tab.port,
          auth: {
            username: tab.username,
            password: tab.password,
            privateKeyPem: tab.privateKey,
          },
          relayUrl: relayUrl || undefined,
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
          ssh.mode === 'direct'
            ? 'direct'
            : ssh.mode === 'local-relay'
              ? 'local-relay'
              : 'relay'
        );

        // Keep terminal resize in sync with remote PTY
        const fitResize = () => {
          try {
            engine1.resize();
            const dims = engine1.terminal;
            ssh.resize(dims.cols, dims.rows);
          } catch {
            /* ignore */
          }
        };
        window.addEventListener('resize', fitResize);
        // store cleanup on sshRef via property
        (ssh as any)._fitResize = fitResize;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        engine1.terminal.writeln(`\r\n\x1b[1;31mSSH Error:\x1b[0m ${message}\r\n`);
        setStatus('error');
        // Fall back to offline so tab remains interactive
        await connectOffline('真实 SSH 失败，已回退 Offline Shell。');
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
      const ssh = sshRef.current;
      if (ssh && (ssh as any)._fitResize) {
        window.removeEventListener('resize', (ssh as any)._fitResize);
      }
      void sshRef.current?.close();
      sshRef.current = null;
      sessionRegistry.unregister(tab.id);
      engine1.dispose();
      engineRef1.current = null;
    };
  }, [tab.id, tab.host, tab.port, tab.username, tab.password, tab.privateKey, tab.forceOffline, relayUrl]);

  // Split pane offline
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
            ) : connectionMode === 'direct' ? (
              <Zap className="h-3.5 w-3.5" />
            ) : connectionMode.includes('relay') ? (
              <Link2 className="h-3.5 w-3.5" />
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
