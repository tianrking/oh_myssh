import React from 'react';
import {
  X,
  Plus,
  Terminal,
  HardDrive,
  Columns2,
  Rows2,
  Maximize2,
  Sparkles,
  Zap,
  LayoutGrid
} from 'lucide-react';

export interface TabItem {
  id: string;
  title: string;
  type: 'ssh' | 'sftp';
  host: string;
  port: number;
  username: string;
  splitMode?: 'none' | 'vertical' | 'horizontal';
  theme?: string;
}

interface Props {
  tabs: TabItem[];
  activeTabId: string | null;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewQuickConnect: () => void;
  onToggleSplit: (id: string, mode: 'vertical' | 'horizontal') => void;
}

export const WorkspaceTabs: React.FC<Props> = ({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewQuickConnect,
  onToggleSplit,
}) => {
  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex h-10 w-full items-center justify-between border-b border-slate-800 bg-slate-950/80 px-2 select-none overflow-x-auto">
      {/* Tabs list */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSelectTab(tab.id)}
              className={`group flex items-center gap-2 rounded-t-lg border-t border-x px-3 py-1.5 text-xs font-medium cursor-pointer transition-all ${
                isActive
                  ? 'border-cyan-500/40 bg-slate-900 text-cyan-300 shadow-inner'
                  : 'border-transparent text-slate-400 hover:bg-slate-900/60 hover:text-slate-200'
              }`}
            >
              {tab.type === 'ssh' ? (
                <Terminal className={`h-3.5 w-3.5 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
              ) : (
                <HardDrive className={`h-3.5 w-3.5 ${isActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              )}
              <span className="max-w-[140px] truncate font-mono text-[11px]">
                {tab.title}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                className="rounded p-0.5 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-slate-800 hover:text-slate-300 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          onClick={onNewQuickConnect}
          title="快速新建连接"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-slate-800 text-slate-400 hover:border-cyan-500/30 hover:bg-cyan-500/10 hover:text-cyan-300 transition-all"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Tab Control Bar (Split & Layout) */}
      {activeTab && (
        <div className="flex items-center gap-1 pl-3 shrink-0">
          <button
            onClick={() => onToggleSplit(activeTab.id, 'vertical')}
            title="左右垂直分屏 (Split Vertical)"
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium border transition-all ${
              activeTab.splitMode === 'vertical'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" />
            <span>左右分屏</span>
          </button>
          <button
            onClick={() => onToggleSplit(activeTab.id, 'horizontal')}
            title="上下水平分屏 (Split Horizontal)"
            className={`flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium border transition-all ${
              activeTab.splitMode === 'horizontal'
                ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300'
                : 'border-slate-800 text-slate-400 hover:bg-slate-900 hover:text-slate-200'
            }`}
          >
            <Rows2 className="h-3.5 w-3.5" />
            <span>上下分屏</span>
          </button>
        </div>
      )}
    </div>
  );
};
