import React, { useState, useEffect } from 'react';
import { Search, Terminal, Zap, HardDrive, Shield, Key, Sparkles, X } from 'lucide-react';
import type { QuickSnippet } from '../core/vault/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  snippets: QuickSnippet[];
  onExecuteSnippet: (command: string) => void;
}

export const CommandPalette: React.FC<Props> = ({
  isOpen,
  onClose,
  snippets,
  onExecuteSnippet,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open handled by parent state
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredSnippets = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(query.toLowerCase()) ||
      s.command.toLowerCase().includes(query.toLowerCase()) ||
      (s.category && s.category.toLowerCase().includes(query.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Search Bar Input */}
        <div className="flex items-center border-b border-slate-800 px-4 py-3">
          <Search className="h-4 w-4 text-cyan-400 mr-3" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索命令片段或操作 (例如: htop, docker ps)..."
            className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-1">
          {filteredSnippets.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">未找到相关命令片段</div>
          ) : (
            filteredSnippets.map((s) => (
              <div
                key={s.id}
                onClick={() => {
                  onExecuteSnippet(s.command);
                  onClose();
                }}
                className="group flex items-center justify-between rounded-xl p-3 text-xs cursor-pointer border border-transparent hover:border-cyan-500/30 hover:bg-cyan-500/10 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-cyan-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-300">
                    <Terminal className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-200 group-hover:text-cyan-300">
                      {s.title}
                    </div>
                    <div className="font-mono text-[11px] text-slate-400 truncate max-w-sm">
                      {s.command}
                    </div>
                  </div>
                </div>

                {s.category && (
                  <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] text-slate-400 group-hover:bg-cyan-500/20 group-hover:text-cyan-300">
                    {s.category}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer shortcuts tip */}
        <div className="border-t border-slate-800 bg-slate-950 px-4 py-2 text-[10px] text-slate-500 flex justify-between">
          <span>Esc 键关闭</span>
          <span>使用 ↵ 发送至当前活动终端</span>
        </div>
      </div>
    </div>
  );
};
