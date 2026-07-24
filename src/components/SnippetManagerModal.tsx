import React, { useState } from 'react';
import { X, Code2, Plus, Trash2, Edit2, Sparkles, Tag } from 'lucide-react';
import { db, type QuickSnippet } from '../core/vault/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  snippets: QuickSnippet[];
  onSnippetsUpdated: () => void;
}

export const SnippetManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  snippets,
  onSnippetsUpdated,
}) => {
  const [title, setTitle] = useState('');
  const [command, setCommand] = useState('');
  const [category, setCategory] = useState('常用指令');

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !command.trim()) return;

    await db.snippets.add({
      title: title.trim(),
      command: command.trim(),
      category: category.trim() || '常用指令',
    });

    setTitle('');
    setCommand('');
    onSnippetsUpdated();
  };

  const handleDelete = async (id: number) => {
    await db.snippets.delete(id);
    onSnippetsUpdated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Code2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">快捷命令片段管理器</h3>
              <p className="text-xs text-slate-400">管理常用 Linux/Unix 运维命令与多分类标签</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-5 divide-x divide-slate-800 h-96">
          {/* Add Form */}
          <form onSubmit={handleAdd} className="col-span-2 p-5 space-y-4 text-xs bg-slate-950/40">
            <h4 className="font-semibold text-slate-200 flex items-center gap-1">
              <Plus className="h-4 w-4 text-cyan-400" />
              新增命令片段
            </h4>

            <div>
              <label className="block text-slate-400 mb-1">标题说明</label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="例: Docker 实时容器日志"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">脚本/命令内容</label>
              <textarea
                rows={3}
                required
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="docker logs -f --tail 100 app"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">分类标签</label>
              <input
                type="text"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Docker / 磁盘清理"
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-2 font-semibold text-white shadow-lg shadow-cyan-500/20 hover:from-cyan-400 hover:to-blue-500"
            >
              添加至片段库
            </button>
          </form>

          {/* Existing Snippets List */}
          <div className="col-span-3 p-5 overflow-y-auto space-y-2">
            <h4 className="font-semibold text-slate-200 text-xs mb-3 flex items-center justify-between">
              <span>已存命令列表 ({snippets.length})</span>
              <span className="text-[10px] text-slate-500">持久化存储于 IndexedDB</span>
            </h4>

            {snippets.map((s) => (
              <div key={s.id} className="group flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 p-3 text-xs hover:border-cyan-500/30 transition-all">
                <div className="truncate max-w-[240px]">
                  <div className="font-medium text-slate-200 flex items-center gap-1.5">
                    <span>{s.title}</span>
                    {s.category && (
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] text-cyan-400 border border-slate-700">
                        {s.category}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-slate-400 truncate mt-0.5">
                    {s.command}
                  </div>
                </div>

                {s.id && (
                  <button
                    onClick={() => handleDelete(s.id!)}
                    title="删除"
                    className="rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-500/20 hover:text-rose-400 transition-all"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
