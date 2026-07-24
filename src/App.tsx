import React, { useEffect, useState, useCallback } from 'react';
import { db, seedInitialDataIfNeeded, type HostProfile, type QuickSnippet } from './core/vault/storage';
import { HeaderNavbar } from './components/HeaderNavbar';
import { HostSidebar } from './components/HostSidebar';
import { WorkspaceTabs, type TabItem } from './components/WorkspaceTabs';
import { TerminalView } from './components/TerminalView';
import { SftpView } from './components/SftpView';
import { QuickConnectModal } from './components/QuickConnectModal';
import { CommandPalette } from './components/CommandPalette';
import { SessionPropertiesModal } from './components/SessionPropertiesModal';
import { BroadcastInputBar } from './components/BroadcastInputBar';
import { SnippetManagerModal } from './components/SnippetManagerModal';
import { ThemeManagerModal } from './components/ThemeManagerModal';
import { RelaySettingsModal } from './components/RelaySettingsModal';
import { t, subscribeLanguageChange } from './core/i18n';
import { sessionRegistry } from './core/session/registry';
import { Terminal, HardDrive, Lock, Plus } from 'lucide-react';

const RELAY_STORAGE_KEY = 'ohmyssh.relayUrl';
const THEME_STORAGE_KEY = 'ohmyssh.theme';

export function App() {
  const [hosts, setHosts] = useState<HostProfile[]>([]);
  const [snippets, setSnippets] = useState<QuickSnippet[]>([]);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(false);
  const [isBroadcastOpen, setIsBroadcastOpen] = useState(false);
  const [isSnippetManagerOpen, setIsSnippetManagerOpen] = useState(false);
  const [isThemeManagerOpen, setIsThemeManagerOpen] = useState(false);
  const [isRelaySettingsOpen, setIsRelaySettingsOpen] = useState(false);
  const [relayUrl, setRelayUrl] = useState(() => {
    try {
      return localStorage.getItem(RELAY_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [currentTheme, setCurrentTheme] = useState(() => {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) || 'cyberpunk';
    } catch {
      return 'cyberpunk';
    }
  });
  const [, setLangTick] = useState(0);

  useEffect(() => {
    return subscribeLanguageChange(() => {
      setLangTick((v) => v + 1);
    });
  }, []);

  useEffect(() => {
    async function init() {
      await seedInitialDataIfNeeded();
      const allHosts = await db.hosts.toArray();
      const allSnippets = await db.snippets.toArray();
      setHosts(allHosts);
      setSnippets(allSnippets);

      // Prefer offline demo host so first open always works
      const defaultHost =
        allHosts.find((h) => h.tags?.includes('Offline') || h.host.includes('offline')) ||
        allHosts[0];

      if (defaultHost) {
        const newTab: TabItem = {
          id: 'tab-' + Date.now(),
          title: defaultHost.name,
          type: 'ssh',
          host: defaultHost.host,
          port: defaultHost.port,
          username: defaultHost.username,
          splitMode: 'none',
        };
        setTabs([newTab]);
        setActiveTabId(newTab.id);
        sessionRegistry.setActive(newTab.id);
      }
    }
    void init();
  }, []);

  const handleConnectHost = useCallback(
    async (host: HostProfile | Partial<HostProfile>, options?: { save?: boolean }) => {
      // Persist new quick-connect profiles
      if (options?.save !== false && !host.id && host.host) {
        try {
          const id = await db.hosts.add({
            name: host.name || `${host.username}@${host.host}`,
            host: host.host,
            port: host.port || 22,
            username: host.username || 'root',
            authType: host.authType || 'password',
            password: host.password,
            privateKey: host.privateKey,
            group: host.group || '默认分组',
            tags: host.tags || ['QuickConnect'],
            color: host.color || '#06b6d4',
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          const allHosts = await db.hosts.toArray();
          setHosts(allHosts);
          host = { ...host, id };
        } catch (e) {
          console.warn('保存主机失败', e);
        }
      }

      const newTab: TabItem = {
        id: 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: host.name || `${host.username}@${host.host}`,
        type: 'ssh',
        host: host.host || 'offline.local',
        port: host.port || 22,
        username: host.username || 'root',
        splitMode: 'none',
      };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(newTab.id);
      sessionRegistry.setActive(newTab.id);
    },
    []
  );

  const handleOpenSFTP = useCallback((host: HostProfile) => {
    const newTab: TabItem = {
      id: 'sftp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
      title: `[SFTP] ${host.name}`,
      type: 'sftp',
      host: host.host,
      port: host.port,
      username: host.username,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const handleCloseTab = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTabId === id) {
          const next = filtered.length > 0 ? filtered[filtered.length - 1].id : null;
          setActiveTabId(next);
          sessionRegistry.setActive(next);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const handleSelectTab = useCallback((id: string) => {
    setActiveTabId(id);
    sessionRegistry.setActive(id);
    // Fit after visibility switch
    requestAnimationFrame(() => sessionRegistry.resize(id));
  }, []);

  const handleToggleSplit = useCallback((id: string, mode: 'vertical' | 'horizontal') => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextMode = t.splitMode === mode ? 'none' : mode;
          return { ...t, splitMode: nextMode };
        }
        return t;
      })
    );
  }, []);

  const handleDeleteHost = useCallback(async (id: number) => {
    await db.hosts.delete(id);
    setHosts((prev) => prev.filter((h) => h.id !== id));
  }, []);

  const handleBroadcastCommand = useCallback((cmd: string) => {
    const n = sessionRegistry.broadcast(cmd);
    if (n === 0) {
      console.warn('No active SSH sessions to broadcast');
    }
  }, []);

  const handleExecuteSnippet = useCallback((cmd: string) => {
    const ok = sessionRegistry.runOnActive(cmd);
    if (!ok) {
      // If no session, open quick connect
      setIsQuickConnectOpen(true);
    }
  }, []);

  const handleExportLog = useCallback(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;

    const log =
      sessionRegistry.exportLog(activeTab.id) ||
      `[No live buffer]\nSession: ${activeTab.title}\nTarget: ${activeTab.username}@${activeTab.host}:${activeTab.port}\nDate: ${new Date().toISOString()}\n`;

    const blob = new Blob(
      [
        `Session Transcript — Oh My SSH\n`,
        `Title: ${activeTab.title}\n`,
        `Target: ${activeTab.username}@${activeTab.host}:${activeTab.port}\n`,
        `Date: ${new Date().toISOString()}\n`,
        `${'='.repeat(60)}\n\n`,
        log,
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `session_${activeTab.title.replace(/\s+/g, '_')}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tabs, activeTabId]);

  const handleThemeSelect = useCallback((themeName: string) => {
    setCurrentTheme(themeName);
    sessionRegistry.setThemeAll(themeName);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeName);
    } catch {
      /* ignore */
    }
  }, []);

  const handleSaveRelay = useCallback((url: string) => {
    setRelayUrl(url);
    try {
      localStorage.setItem(RELAY_STORAGE_KEY, url);
    } catch {
      /* ignore */
    }
  }, []);

  // Global keyboard shortcuts (Xshell-like)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // Cmd/Ctrl+K — command palette
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((v) => !v);
        return;
      }

      // Cmd/Ctrl+T — new connection
      if (meta && e.key.toLowerCase() === 't' && !e.shiftKey) {
        e.preventDefault();
        setIsQuickConnectOpen(true);
        return;
      }

      // Cmd/Ctrl+W — close tab
      if (meta && e.key.toLowerCase() === 'w') {
        if (activeTabId) {
          e.preventDefault();
          handleCloseTab(activeTabId);
        }
        return;
      }

      // Cmd/Ctrl+Shift+B — broadcast
      if (meta && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setIsBroadcastOpen((v) => !v);
        return;
      }

      // Ctrl+Tab / Ctrl+Shift+Tab — cycle tabs
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        if (tabs.length < 2) return;
        const idx = tabs.findIndex((t) => t.id === activeTabId);
        const next = e.shiftKey
          ? (idx - 1 + tabs.length) % tabs.length
          : (idx + 1) % tabs.length;
        handleSelectTab(tabs[next].id);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeTabId, tabs, handleCloseTab, handleSelectTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      <HeaderNavbar
        onOpenQuickConnect={() => setIsQuickConnectOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleBroadcast={() => setIsBroadcastOpen((v) => !v)}
        isBroadcastActive={isBroadcastOpen}
        onOpenProperties={() => setIsPropertiesOpen(true)}
        onExportLog={handleExportLog}
        onOpenSnippetManager={() => setIsSnippetManagerOpen(true)}
        onOpenThemeManager={() => setIsThemeManagerOpen(true)}
        onOpenRelaySettings={() => setIsRelaySettingsOpen(true)}
      />

      <div className="flex flex-1 overflow-hidden">
        <HostSidebar
          hosts={hosts}
          onConnectHost={(h) => void handleConnectHost(h, { save: false })}
          onOpenSFTP={handleOpenSFTP}
          onAddHost={() => setIsQuickConnectOpen(true)}
          onDeleteHost={handleDeleteHost}
        />

        <div className="flex flex-1 flex-col overflow-hidden bg-slate-950">
          {tabs.length > 0 && (
            <WorkspaceTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={handleSelectTab}
              onCloseTab={handleCloseTab}
              onNewQuickConnect={() => setIsQuickConnectOpen(true)}
              onToggleSplit={handleToggleSplit}
            />
          )}

          {/* Keep ALL tabs mounted so SSH/offline sessions survive tab switches */}
          {tabs.length > 0 ? (
            <div className="flex-1 overflow-hidden relative">
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className="absolute inset-0"
                  style={{
                    visibility: tab.id === activeTabId ? 'visible' : 'hidden',
                    pointerEvents: tab.id === activeTabId ? 'auto' : 'none',
                    zIndex: tab.id === activeTabId ? 1 : 0,
                  }}
                  aria-hidden={tab.id !== activeTabId}
                >
                  {tab.type === 'ssh' ? (
                    <TerminalView
                      tab={tab}
                      relayUrl={relayUrl}
                      theme={currentTheme}
                      isActive={tab.id === activeTabId}
                    />
                  ) : (
                    <SftpView tab={tab} />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 select-none">
              <div className="relative mb-6">
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 opacity-30 blur-xl" />
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-500/30 bg-slate-900 text-cyan-400 shadow-2xl">
                  <Terminal className="h-10 w-10" />
                </div>
              </div>

              <h2 className="text-2xl font-extrabold tracking-tight text-slate-100 mb-2">
                {t('welcomeTitle')}
              </h2>
              <p className="max-w-md text-xs text-slate-400 leading-relaxed mb-8">
                {t('welcomeSub')}
              </p>

              <div className="grid grid-cols-3 gap-4 max-w-xl w-full mb-8 text-left">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <Terminal className="h-5 w-5 text-cyan-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">xterm.js WebGL</h4>
                  <p className="text-[11px] text-slate-500 mt-1">帧批处理 + 低延迟输入</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <Lock className="h-5 w-5 text-emerald-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">加密 Vault</h4>
                  <p className="text-[11px] text-slate-500 mt-1">AES-256-GCM 本地凭据</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <HardDrive className="h-5 w-5 text-purple-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">离线 Shell</h4>
                  <p className="text-[11px] text-slate-500 mt-1">无网络也能完整开发体验</p>
                </div>
              </div>

              <button
                onClick={() => setIsQuickConnectOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-semibold text-white shadow-xl shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> {t('newConnection')}
              </button>
            </div>
          )}

          <BroadcastInputBar
            isOpen={isBroadcastOpen}
            onClose={() => setIsBroadcastOpen(false)}
            onBroadcast={handleBroadcastCommand}
            targetCount={sessionRegistry.size() || tabs.filter((t) => t.type === 'ssh').length}
          />
        </div>
      </div>

      <QuickConnectModal
        isOpen={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        onConnect={(profile) => void handleConnectHost(profile, { save: true })}
      />

      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        snippets={snippets}
        onExecuteSnippet={handleExecuteSnippet}
      />

      <SessionPropertiesModal
        isOpen={isPropertiesOpen}
        onClose={() => setIsPropertiesOpen(false)}
        onSave={(settings) => {
          console.log('Session settings:', settings);
        }}
      />

      <SnippetManagerModal
        isOpen={isSnippetManagerOpen}
        onClose={() => setIsSnippetManagerOpen(false)}
        snippets={snippets}
        onSnippetsUpdated={async () => {
          const allSnippets = await db.snippets.toArray();
          setSnippets(allSnippets);
        }}
      />

      <ThemeManagerModal
        isOpen={isThemeManagerOpen}
        onClose={() => setIsThemeManagerOpen(false)}
        currentTheme={currentTheme}
        onSelectTheme={handleThemeSelect}
      />

      <RelaySettingsModal
        isOpen={isRelaySettingsOpen}
        onClose={() => setIsRelaySettingsOpen(false)}
        currentRelayUrl={relayUrl}
        onSaveRelayUrl={handleSaveRelay}
      />
    </div>
  );
}

export default App;
