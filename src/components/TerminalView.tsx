import React, { useEffect, useRef, useState } from 'react';
import { TerminalEngine } from '../core/terminal/engine';
import {
  MockSocketTransport,
  DirectSocketsTransport,
  WebSocketRelayTransport,
  resolveConnectionMode,
  type SocketTransport,
  type ConnectionMode,
} from '../core/socket/transport';
import { sessionRegistry, type SessionMode } from '../core/session/registry';
import { Palette, RefreshCw, Cpu, ShieldCheck, WifiOff, Link2 } from 'lucide-react';
import { t } from '../core/i18n';
import type { TabItem } from './WorkspaceTabs';

interface Props {
  tab: TabItem;
  relayUrl?: string;
  theme?: string;
  isActive?: boolean;
}

function modeLabel(mode: ConnectionMode): string {
  switch (mode) {
    case 'direct':
      return 'Direct Sockets (IWA)';
    case 'relay':
      return 'WebSocket Relay';
    default:
      return 'Offline Interactive Shell';
  }
}

function toSessionMode(mode: ConnectionMode): SessionMode {
  return mode;
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

  const [currentTheme, setCurrentTheme] = useState(theme);
  const [transportName, setTransportName] = useState('Connecting…');
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>('offline');
  const [connectedTime, setConnectedTime] = useState('');
  const [useWebGL, setUseWebGL] = useState(true);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');

  // External theme changes
  useEffect(() => {
    if (theme && theme !== currentTheme) {
      setCurrentTheme(theme);
      engineRef1.current?.setTheme(theme);
      engineRef2.current?.setTheme(theme);
    }
  }, [theme]);

  // Refit + focus when tab becomes active (tabs stay mounted)
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
    setConnectedTime(new Date().toLocaleTimeString());
    setStatus('connecting');

    const engine1 = new TerminalEngine(currentTheme);
    engineRef1.current = engine1;

    if (containerRef1.current) {
      engine1.mount(containerRef1.current);
    }

    const probeAndConnect = async () => {
      const mode = resolveConnectionMode(relayUrl);
      setConnectionMode(mode);
      setTransportName(modeLabel(mode));

      let transport: SocketTransport;
      if (mode === 'direct') {
        transport = new DirectSocketsTransport();
      } else if (mode === 'relay') {
        transport = new WebSocketRelayTransport(relayUrl!);
      } else {
        transport = new MockSocketTransport();
      }

      try {
        const stream = await transport.connect(tab.host, tab.port, tab.username);
        engine1.attachStream(stream);
        setStatus('connected');
        setTransportName(transport.name);

        sessionRegistry.register(tab.id, engine1, {
          mode: toSessionMode(mode),
          title: tab.title,
          host: `${tab.username}@${tab.host}:${tab.port}`,
        });

        if (isActive) {
          sessionRegistry.setActive(tab.id);
        }
      } catch (err: unknown) {
        setStatus('error');
        const message = err instanceof Error ? err.message : String(err);
        engine1.terminal.writeln(`\r\n\x1b[1;31mConnection Error:\x1b[0m ${message}`);

        // Graceful fallback: if direct/relay fails, open offline shell so the tab is still usable
        if (mode !== 'offline') {
          engine1.terminal.writeln(
            '\x1b[33mFalling back to Offline Interactive Shell…\x1b[0m\r\n'
          );
          try {
            const offline = new MockSocketTransport();
            const stream = await offline.connect(tab.host, tab.port, tab.username);
            engine1.attachStream(stream);
            setConnectionMode('offline');
            setTransportName(offline.name);
            setStatus('connected');
            sessionRegistry.register(tab.id, engine1, {
              mode: 'offline',
              title: tab.title,
              host: `${tab.username}@${tab.host}:${tab.port}`,
            });
          } catch (fallbackErr: unknown) {
            engine1.terminal.writeln(
              `\x1b[1;31mOffline fallback failed:\x1b[0m ${
                fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
              }`
            );
          }
        }
      }
    };

    void probeAndConnect();

    const handleResize = () => {
      engine1.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      sessionRegistry.unregister(tab.id);
      engine1.dispose();
      engineRef1.current = null;
    };
    // Intentionally only re-connect when session identity changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, tab.host, tab.port, tab.username, relayUrl]);

  // Split pane terminal
  useEffect(() => {
    if (tab.splitMode && tab.splitMode !== 'none') {
      const engine2 = new TerminalEngine(currentTheme);
      engineRef2.current = engine2;
      if (containerRef2.current) {
        engine2.mount(containerRef2.current);
      }
      const offline = new MockSocketTransport();
      offline.connect(tab.host, tab.port, tab.username).then((s) => engine2.attachStream(s));

      return () => {
        engine2.dispose();
        engineRef2.current = null;
      };
    }
  }, [tab.splitMode, tab.id, tab.host, tab.port, tab.username]);

  // Refit after split layout changes
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
        <div className="flex items-center gap-4">
          <span className={`flex items-center gap-1.5 ${statusColor}`}>
            {connectionMode === 'offline' ? (
              <WifiOff className="h-3.5 w-3.5" />
            ) : connectionMode === 'relay' ? (
              <Link2 className="h-3.5 w-3.5" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            <span>{transportName}</span>
          </span>

          <button
            onClick={handleRendererToggle}
            title={t('rendererToggleTooltip')}
            className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <Cpu className={`h-3.5 w-3.5 ${useWebGL ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{useWebGL ? t('webglAccel') : t('canvasFast')}</span>
          </button>

          <span className="hidden sm:inline text-slate-500">
            {tab.username}@{tab.host}:{tab.port}
            {connectedTime ? ` · ${connectedTime}` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Palette className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="bg-transparent text-[11px] text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="cyberpunk" className="bg-slate-900">
                Cyberpunk Neon
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
            }}
            title="Fit & Focus"
            className="flex items-center gap-1 hover:text-cyan-300 transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{t('fitTerminal')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
