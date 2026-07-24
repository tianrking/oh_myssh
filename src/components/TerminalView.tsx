import React, { useEffect, useRef, useState } from 'react';
import { TerminalEngine } from '../core/terminal/engine';
import {
  MockSocketTransport,
  DirectSocketsTransport,
  WebSocketRelayTransport,
  type SocketTransport
} from '../core/socket/transport';
import { Palette, RefreshCw, Cpu, ShieldCheck, Network, AlertOctagon } from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';

interface Props {
  tab: TabItem;
  relayUrl?: string;
}

export const TerminalView: React.FC<Props> = ({ tab, relayUrl }) => {
  const containerRef1 = useRef<HTMLDivElement>(null);
  const containerRef2 = useRef<HTMLDivElement>(null);
  
  const engineRef1 = useRef<TerminalEngine | null>(null);
  const engineRef2 = useRef<TerminalEngine | null>(null);

  const [currentTheme, setCurrentTheme] = useState('cyberpunk');
  const [transportName, setTransportName] = useState('Checking Network Capability...');
  const [connectedTime, setConnectedTime] = useState<string>('');
  const [useWebGL, setUseWebGL] = useState<boolean>(true);

  useEffect(() => {
    setConnectedTime(new Date().toLocaleTimeString());

    // 实例化引擎 1
    const engine1 = new TerminalEngine(currentTheme);
    engineRef1.current = engine1;

    if (containerRef1.current) {
      engine1.mount(containerRef1.current);
    }

    // 真实 SSH TCP 连接能力决策树
    const probeAndConnect = async () => {
      const hasDirectSockets = typeof window !== 'undefined' && 'TCPSocket' in window;

      let transport: SocketTransport;

      if (hasDirectSockets) {
        // 模式 A: Chromium IWA DirectSockets 原始 TCP 直连模式
        transport = new DirectSocketsTransport();
        setTransportName(transport.name);
      } else if (relayUrl && relayUrl.trim().length > 0) {
        // 模式 B: WebSocket Relay 中继真实 SSH 模式
        transport = new WebSocketRelayTransport(relayUrl);
        setTransportName(transport.name);
      } else if (tab.host === '127.0.0.1' || tab.host.includes('internal.net') || tab.host === 'demo.server') {
        // 模式 C: 明确的内置 Demo / 演示环境
        transport = new MockSocketTransport();
        setTransportName('Demo Mock Shell');
      } else {
        // 模式 D: 普通网页尝试连接真实外网 SSH，既无 DirectSockets 也无 Relay 的透明诊断报错
        setTransportName('Direct TCP Unsupported');
        const term = engine1.terminal;
        term.writeln('\x1b[1;31m============================================================\x1b[0m');
        term.writeln('\x1b[1;31m SSH CONNECT ERROR: Direct TCP/22 Not Supported in Web Page\x1b[0m');
        term.writeln('\x1b[1;31m============================================================\x1b[0m');
        term.writeln(``);
        term.writeln(` \x1b[33m目标服务器\x1b[0m: ${tab.username}@${tab.host}:${tab.port}`);
        term.writeln(` \x1b[33m拒绝原因\x1b[0m  : 浏览器 W3C 安全规范禁止普通网页直接发起原始 TCP 连接。`);
        term.writeln(``);
        term.writeln(` \x1b[1;32m要连接任意真实的外部 SSH 服务器，请选择以下任一解决方案：\x1b[0m`);
        term.writeln(`   \x1b[36m1. Chromium IWA 模式\x1b[0m: 在支持 Direct Sockets 的 Chromium IWA 中启动包文件。`);
        term.writeln(`   \x1b[36m2. 配置 WebSocket Relay\x1b[0m: 点击顶部 "Relay" 按钮配置自建网关（如 wss://your-relay/ssh）。`);
        term.writeln(`   \x1b[36m3. 体验 Demo 环境\x1b[0m: 在侧边栏选择预置的“开发测试机”体验内置 Shell。`);
        term.writeln(``);
        term.writeln('\x1b[1;31m============================================================\x1b[0m');
        return;
      }

      try {
        const stream = await transport.connect(tab.host, tab.port);
        engine1.attachStream(stream);
      } catch (err: any) {
        engine1.terminal.writeln(`\r\n\x1b[1;31mConnection Error:\x1b[0m ${err?.message || err}`);
      }
    };

    probeAndConnect();

    // 窗口尺寸调整监听
    const handleResize = () => {
      engine1.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      engine1.dispose();
    };
  }, [tab.id, tab.host, tab.port, relayUrl]);

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

  const handleRendererToggle = () => {
    const nextState = !useWebGL;
    setUseWebGL(nextState);
    if (nextState) {
      engineRef1.current?.enableWebGL();
      engineRef2.current?.enableWebGL();
    } else {
      engineRef1.current?.disableWebGL();
      engineRef2.current?.disableWebGL();
    }
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
          className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner cursor-text"
        />

        {tab.splitMode && tab.splitMode !== 'none' && (
          <div
            ref={containerRef2}
            className="h-full w-full flex-1 overflow-hidden rounded-lg border border-slate-800/80 bg-slate-950 p-2 shadow-inner cursor-text"
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

          {/* Renderer Toggle Switch */}
          <button
            onClick={handleRendererToggle}
            title="点击切换硬件加速模式 (WebGL 模式 vs Canvas 极速低延迟模式)"
            className="flex items-center gap-1 text-slate-300 hover:text-cyan-300 transition-colors"
          >
            <Cpu className={`h-3.5 w-3.5 ${useWebGL ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span>{useWebGL ? 'WebGL 加速' : 'Canvas 极速 2D'}</span>
          </button>

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
