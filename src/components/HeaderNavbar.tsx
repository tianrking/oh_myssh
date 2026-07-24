import React, { useEffect, useState } from 'react';
import {
  Terminal,
  Zap,
  Search,
  Globe,
  Radio,
  Settings,
  Download,
  Network
} from 'lucide-react';
import { DirectSocketsTransport } from '../core/socket/transport';
import { t, getLanguage, setLanguage, subscribeLanguageChange, LANGUAGE_LABELS, type SupportedLanguage } from '../core/i18n';

interface Props {
  onOpenQuickConnect: () => void;
  onOpenCommandPalette: () => void;
  onToggleBroadcast: () => void;
  isBroadcastActive: boolean;
  onOpenProperties: () => void;
  onExportLog: () => void;
  onOpenSnippetManager?: () => void;
  onOpenThemeManager?: () => void;
  onOpenRelaySettings?: () => void;
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
  onOpenRelaySettings,
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
        {/* Advanced optional bridge — not the default path */}
        <button
          onClick={onOpenRelaySettings}
          title="高级：可选 TCP 桥（默认不需要，直连优先）"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-500 hover:border-slate-600 hover:text-slate-300 transition-all opacity-70"
        >
          <Network className="h-4 w-4" />
        </button>

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
          <span className="hidden md:inline">{t('broadcast')}</span>
        </button>

        {/* i18n Selector */}
        <div className="flex items-center gap-1 border border-slate-800 bg-slate-900/60 rounded-lg px-2 py-1 text-[11px]">
          <Globe className="h-3.5 w-3.5 text-cyan-400" />
          <select
            value={lang}
            onChange={(e) => handleLanguageToggle(e.target.value as SupportedLanguage)}
            className="bg-transparent text-slate-300 focus:outline-none cursor-pointer text-[11px]"
          >
            {(Object.keys(LANGUAGE_LABELS) as SupportedLanguage[]).map((code) => (
              <option key={code} value={code} className="bg-slate-900 text-slate-200">
                {LANGUAGE_LABELS[code]}
              </option>
            ))}
          </select>
        </div>

        {/* DirectSockets Runtime Indicator */}
        <div
          title="纯前端静态站 · 可托管 Vercel · 真实 SSH 需浏览器 Direct Sockets 或可选外部网关"
          className="hidden lg:flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1 text-[11px] font-mono"
        >
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          <span className="text-cyan-300">Static SPA</span>
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
