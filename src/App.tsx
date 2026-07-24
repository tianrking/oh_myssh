import React, { useEffect, useState } from 'react';
import { db, seedInitialDataIfNeeded, type HostProfile, type QuickSnippet } from './core/vault/storage';
import { HeaderNavbar } from './components/HeaderNavbar';
import { HostSidebar } from './components/HostSidebar';
import { WorkspaceTabs, type TabItem } from './components/WorkspaceTabs';
import { TerminalView } from './components/TerminalView';
import { SftpView } from './components/SftpView';
import { QuickConnectModal } from './components/QuickConnectModal';
import { CommandPalette } from './components/CommandPalette';
import {
  Terminal,
  Zap,
  HardDrive,
  Shield,
  Sparkles,
  Server,
  Cpu,
  Lock,
  Plus
} from 'lucide-react';

export function App() {
  const [hosts, setHosts] = useState<HostProfile[]>([]);
  const [snippets, setSnippets] = useState<QuickSnippet[]>([]);
  const [tabs, setTabs] = useState<TabItem[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const [isQuickConnectOpen, setIsQuickConnectOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // 初始化数据库数据并加载
  useEffect(() => {
    async function init() {
      await seedInitialDataIfNeeded();
      const allHosts = await db.hosts.toArray();
      const allSnippets = await db.snippets.toArray();
      setHosts(allHosts);
      setSnippets(allSnippets);

      // 默认自动开启一个 Mock 终端 Tab 体验
      if (allHosts.length > 0) {
        const defaultHost = allHosts[0];
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
      }
    }
    init();
  }, []);

  // 发起终端连接
  const handleConnectHost = (host: HostProfile | Partial<HostProfile>) => {
    const newTab: TabItem = {
      id: 'tab-' + Date.now(),
      title: host.name || `${host.username}@${host.host}`,
      type: 'ssh',
      host: host.host || '127.0.0.1',
      port: host.port || 22,
      username: host.username || 'root',
      splitMode: 'none',
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // 打开 SFTP 视角
  const handleOpenSFTP = (host: HostProfile) => {
    const newTab: TabItem = {
      id: 'sftp-' + Date.now(),
      title: `[SFTP] ${host.name}`,
      type: 'sftp',
      host: host.host,
      port: host.port,
      username: host.username,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  };

  // 关闭标签
  const handleCloseTab = (id: string) => {
    setTabs((prev) => {
      const filtered = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        if (filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        } else {
          setActiveTabId(null);
        }
      }
      return filtered;
    });
  };

  // 切换分屏模式
  const handleToggleSplit = (id: string, mode: 'vertical' | 'horizontal') => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id === id) {
          const nextMode = t.splitMode === mode ? 'none' : mode;
          return { ...t, splitMode: nextMode };
        }
        return t;
      })
    );
  };

  // 删除主机
  const handleDeleteHost = async (id: number) => {
    await db.hosts.delete(id);
    setHosts((prev) => prev.filter((h) => h.id !== id));
  };

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-screen w-screen flex-col bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Navbar Header */}
      <HeaderNavbar
        onOpenQuickConnect={() => setIsQuickConnectOpen(true)}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
      />

      {/* Main Workspace Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <HostSidebar
          hosts={hosts}
          onConnectHost={handleConnectHost}
          onOpenSFTP={handleOpenSFTP}
          onAddHost={() => setIsQuickConnectOpen(true)}
          onDeleteHost={handleDeleteHost}
        />

        {/* Center Main Stage */}
        <div className="flex flex-1 flex-col overflow-hidden bg-slate-950">
          {/* Workspace Tabs */}
          {tabs.length > 0 && (
            <WorkspaceTabs
              tabs={tabs}
              activeTabId={activeTabId}
              onSelectTab={(id) => setActiveTabId(id)}
              onCloseTab={handleCloseTab}
              onNewQuickConnect={() => setIsQuickConnectOpen(true)}
              onToggleSplit={handleToggleSplit}
            />
          )}

          {/* Tab Content Display */}
          {activeTab ? (
            <div className="flex-1 overflow-hidden">
              {activeTab.type === 'ssh' ? (
                <TerminalView tab={activeTab} />
              ) : (
                <SftpView tab={activeTab} />
              )}
            </div>
          ) : (
            /* Welcome / Empty Stage */
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-gradient-to-b from-slate-950 via-slate-900/50 to-slate-950 select-none">
              <div className="relative mb-6">
                <div className="absolute -inset-1 rounded-3xl bg-gradient-to-r from-cyan-500 to-blue-600 opacity-30 blur-xl"></div>
                <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-cyan-500/30 bg-slate-900 text-cyan-400 shadow-2xl">
                  <Terminal className="h-10 w-10" />
                </div>
              </div>

              <h2 className="text-2xl font-extrabold tracking-tight text-slate-100 mb-2">
                Oh My SSH 工作区已就绪
              </h2>
              <p className="max-w-md text-xs text-slate-400 leading-relaxed mb-8">
                真正的纯前端 SSH / SFTP 体验。在 Chromium IWA 中通过 Direct Sockets 直接连接目标 TCP/22，数据与私钥永久留在本地。
              </p>

              <div className="grid grid-cols-3 gap-4 max-w-xl w-full mb-8 text-left">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <Cpu className="h-5 w-5 text-cyan-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">xterm.js WebGL</h4>
                  <p className="text-[11px] text-slate-500 mt-1">硬加速渲染与低延迟吞吐控制</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <Lock className="h-5 w-5 text-emerald-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">加密 Vault</h4>
                  <p className="text-[11px] text-slate-500 mt-1">Argon2id + AES-256 本地密钥保护</p>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <HardDrive className="h-5 w-5 text-purple-400 mb-2" />
                  <h4 className="text-xs font-semibold text-slate-200">流式 SFTP</h4>
                  <p className="text-[11px] text-slate-500 mt-1">OPFS 大文件无缝流式传输</p>
                </div>
              </div>

              <button
                onClick={() => setIsQuickConnectOpen(true)}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-xs font-semibold text-white shadow-xl shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-[0.98]"
              >
                <Plus className="h-4 w-4" /> 发起新连接
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Quick Connect Dialog */}
      <QuickConnectModal
        isOpen={isQuickConnectOpen}
        onClose={() => setIsQuickConnectOpen(false)}
        onConnect={handleConnectHost}
      />

      {/* Command Palette Dialog */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        snippets={snippets}
        onExecuteSnippet={(cmd) => {
          console.log('Execute snippet:', cmd);
        }}
      />
    </div>
  );
}

export default App;
