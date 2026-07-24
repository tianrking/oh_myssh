import React, { useEffect, useState } from 'react';
import {
  Terminal,
  Zap,
  Search,
  Globe,
  Radio,
  Settings,
  Download
} from 'lucide-react';
import { DirectSocketsTransport } from '../core/socket/transport';
import { t, getLanguage, setLanguage, subscribeLanguageChange, type SupportedLanguage } from '../core/i18n';

interface Props {
  onOpenQuickConnect: () => void;
  onOpenCommandPalette: () => void;
  onToggleBroadcast: () => void;
  isBroadcastActive: boolean;
  onOpenProperties: () => void;
  onExportLog: () => void;
  onOpenSnippetManager?: () => void;
  onOpenThemeManager?: () => void;
}

export const HeaderNavbar: React.FC<Props> = ({
  onOpenQuickConnect,
  onOpenCommandPalette,
  onToggleBroadcast,
  isBroadcastActive,
  onOpenProperties,
  onExportLog,
  onOpenSnippetManager,
  onOpenThemeManager,
}) => {
  const [hasDirectSockets, setHasDirectSockets] = useState<boolean | null>(null);
  const [lang, setLang] = useState<SupportedLanguage>(getLanguage());

  useEffect(() => {
    new DirectSocketsTransport().probe().then((cap) => {
      setHasDirectSockets(cap.directTcp);
    });

    return subscribeLanguageChange(() => {
      setLang(getLanguage());
    });
  }, []);

  const handleLanguageToggle = (newLang: SupportedLanguage) => {
    setLanguage(newLang);
  };

  return (
    <header className="flex h-12 w-full items-center justify-between border-b border-slate-800 bg-slate-950/90 px-4 backdrop-blur-md select-none">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-md shadow-cyan-500/20 text-white font-bold">
          <Terminal className="h-4 w-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm tracking-wide">{t('appName')}</span>
            <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-400">
              v0.1.0 WASM
            </span>
          </div>
          <span className="text-[10px] text-slate-400 block -mt-0.5">
            {t('subtitle')}
          </span>
        </div>
      </div>

      {/* Middle Command Bar Trigger */}
      <button
        onClick={onOpenCommandPalette}
        className="flex items-center gap-2.5 rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-1.5 text-xs text-slate-400 hover:border-cyan-500/40 hover:text-slate-200 transition-all shadow-inner"
      >
        <Search className="h-3.5 w-3.5 text-cyan-400" />
        <span>{t('searchPlaceholder')}</span>
        <kbd className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
          ⌘K
        </kbd>
      </button>

      {/* Right Capabilities & Actions */}
      <div className="flex items-center gap-2">
        {/* Session Properties button */}
        <button
          onClick={onOpenProperties}
          title={t('sessionProperties')}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:border-cyan-500/30 hover:text-cyan-300 transition-all"
        >
          <Settings className="h-4 w-4" />
        </button>

        {/* Export Log Button */}
        <button
          onClick={onExportLog}
          title={t('exportLog')}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 hover:border-emerald-500/30 hover:text-emerald-300 transition-all"
        >
          <Download className="h-4 w-4" />
        </button>

        {/* Broadcast Toggle */}
        <button
          onClick={onToggleBroadcast}
          title={t('broadcastMode')}
          className={`flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-all ${
            isBroadcastActive
              ? 'border-amber-500/50 bg-amber-500/20 text-amber-300 animate-pulse'
              : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-amber-500/30 hover:text-amber-300'
          }`}
        >
          <Radio className="h-3.5 w-3.5" />
          <span className="hidden md:inline">广播</span>
        </button>

        {/* i18n Selector */}
        <div className="flex items-center gap-1 border border-slate-800 bg-slate-900/60 rounded-lg px-2 py-1 text-[11px]">
          <Globe className="h-3.5 w-3.5 text-cyan-400" />
          <select
            value={lang}
            onChange={(e) => handleLanguageToggle(e.target.value as SupportedLanguage)}
            className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-[11px]"
          >
            <option value="zh-CN" className="bg-slate-900 text-slate-200">简体中文</option>
            <option value="en-US" className="bg-slate-900 text-slate-200">English</option>
          </select>
        </div>

        {/* DirectSockets Runtime Indicator */}
        <div
          title={
            hasDirectSockets
              ? 'Chromium Direct Sockets (IWA) 权限就绪：直连 TCP/22'
              : '浏览器当前运行在普通 Web 模式 (使用 WASM/Mock 或 Relay 中继通道)'
          }
          className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] font-mono"
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
          <span>{t('quickConnect')}</span>
        </button>
      </div>
    </header>
  );
};
