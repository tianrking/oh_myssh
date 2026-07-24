import React, { useEffect, useRef, useState } from 'react';
import { TerminalEngine } from '../core/terminal/engine';
import {
  MockSocketTransport,
  DirectSocketsTransport,
  WebSocketRelayTransport,
  type SocketTransport
} from '../core/socket/transport';
import { Palette, RefreshCw, Cpu, Activity, ShieldCheck, Layers } from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';

interface Props {
  tab: TabItem;
}

export const TerminalView: React.FC<Props> = ({ tab }) => {
  const containerRef1 = useRef<HTMLDivElement>(null);
  const containerRef2 = useRef<HTMLDivElement>(null);
  
  const engineRef1 = useRef<TerminalEngine | null>(null);
  const engineRef2 = useRef<TerminalEngine | null>(null);

  const [currentTheme, setCurrentTheme] = useState('cyberpunk');
  const [transportName, setTransportName] = useState('Mock Interactive Shell');
  const [connectedTime, setConnectedTime] = useState<string>('');

  useEffect(() => {
    setConnectedTime(new Date().toLocaleTimeString());

    // 实例化引擎 1
    const engine1 = new TerminalEngine(currentTheme);
    engineRef1.current = engine1;

    if (containerRef1.current) {
      engine1.mount(containerRef1.current);
    }

    // 判断网络传输模式
    let transport: SocketTransport = new MockSocketTransport();
    if (typeof window !== 'undefined' && 'TCPSocket' in window) {
      transport = new DirectSocketsTransport();
    }
    setTransportName(transport.name);

    // 连接 Socket
    transport.connect(tab.host, tab.port).then((stream) => {
      engine1.attachStream(stream);
    }).catch((err) => {
      console.warn('回退至 Mock 传输模式:', err);
      const mock = new MockSocketTransport();
      mock.connect(tab.host, tab.port).then((s) => engine1.attachStream(s));
    });

    // 窗口尺寸调整监听
    const handleResize = () => {
      engine1.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine1.dispose();
    };
  }, [tab.id, tab.host, tab.port]);

  // 分屏终端 2
  useEffect(() => {
    if (tab.splitMode && tab.splitMode !== 'none') {
      const engine2 = new TerminalEngine(currentTheme);
      engineRef2.current = engine2;
      if (containerRef2.current) {
        engine2.mount(containerRef2.current);
      }
      const mock = new MockSocketTransport();
      mock.connect(tab.host, tab.port).then((s) => engine2.attachStream(s));

      return () => {
        engine2.dispose();
      };
    }
  }, [tab.splitMode, tab.id]);

  const handleThemeChange = (themeName: string) => {
    setCurrentTheme(themeName);
    engineRef1.current?.setTheme(themeName);
    engineRef2.current?.setTheme(themeName);
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-950">
      {/* Terminal View Container */}
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
          className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner"
        />

        {tab.splitMode && tab.splitMode !== 'none' && (
          <div
            ref={containerRef2}
            className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner"
          />
        )}
      </div>

      {/* Footer Status Bar */}
      <div className="flex h-7 items-center justify-between border-t border-slate-800/80 bg-slate-950 px-3 text-[11px] text-slate-400 font-mono select-none">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-cyan-400">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>{transportName}</span>
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Cpu className="h-3.5 w-3.5 text-emerald-400" />
            <span>xterm.js WebGL Engine</span>
          </span>
          <span className="hidden sm:inline text-slate-500">
            已连接: {connectedTime}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Theme Selector */}
          <div className="flex items-center gap-1">
            <Palette className="h-3.5 w-3.5 text-slate-500" />
            <select
              value={currentTheme}
              onChange={(e) => handleThemeChange(e.target.value)}
              className="bg-transparent text-[11px] text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="cyberpunk" className="bg-slate-900 text-cyan-300">Cyberpunk Neon</option>
              <option value="oneDark" className="bg-slate-900 text-slate-200">One Dark Classic</option>
              <option value="dracula" className="bg-slate-900 text-purple-300">Dracula Dark</option>
              <option value="monokai" className="bg-slate-900 text-yellow-300">Monokai Pro</option>
            </select>
          </div>

          <button
            onClick={() => engineRef1.current?.resize()}
            title="刷新与重新适配渲染"
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
