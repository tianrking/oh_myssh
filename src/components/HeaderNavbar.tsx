import React, { useEffect, useState } from 'react';
import {
  Terminal,
  Zap,
  Shield,
  Search,
  Cpu,
  Layers,
  Sparkles,
  HelpCircle,
  HardDrive
} from 'lucide-react';
import { DirectSocketsTransport } from '../core/socket/transport';

interface Props {
  onOpenQuickConnect: () => void;
  onOpenCommandPalette: () => void;
}

export const HeaderNavbar: React.FC<Props> = ({
  onOpenQuickConnect,
  onOpenCommandPalette,
}) => {
  const [hasDirectSockets, setHasDirectSockets] = useState<boolean | null>(null);

  useEffect(() => {
    new DirectSocketsTransport().probe().then((cap) => {
      setHasDirectSockets(cap.directTcp);
    });
  }, []);

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-md select-none">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20 text-white font-bold">
          <Terminal className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm tracking-wide">Oh My SSH</span>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-400">
              v0.1.0 WASM
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block -mt-0.5">
            本地优先 • 纯前端 WebSSH & SFTP 工作区
          </span>
        </div>
      </div>

      {/* Middle Command Bar Trigger */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-1.5 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 transition-all shadow-inner"
      >
        <Search className="h-3.5 w-3.5 text-cyan-400" />
        <span>搜索主机、命令片段...</span>
        <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
          ⌘K
        </kbd>
      </button>

      {/* Right Capabilities & Actions */}
      <div className="flex items-center gap-3">
        {/* DirectSockets Runtime Indicator */}
        <div
          title={
            hasDirectSockets
              ? 'Chromium Direct Sockets (IWA) 权限就绪：直连 TCP/22'
              : '浏览器当前运行在普通 Web 模式 (使用 WASM/Mock 或 Relay 中继通道)'
          }
          className="flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] font-mono"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              hasDirectSockets ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
            }`}
          />
          <span className={hasDirectSockets ? 'text-emerald-300' : 'text-amber-300'}>
            {hasDirectSockets ? 'DirectSockets IWA' : 'Web/Mock Mode'}
          </span>
        </div>

        {/* Quick Connect Button */}
        <button
          onClick={onOpenQuickConnect}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-[0.98]"
        >
          <Zap className="h-3.5 w-3.5 fill-current" />
          <span>快速连接</span>
        </button>
      </div>
    </header>
  );
};
