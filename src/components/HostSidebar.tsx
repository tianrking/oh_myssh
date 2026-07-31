import React, { useState } from 'react';
import {
  Server,
  Search,
  Plus,
  ChevronDown,
  ChevronRight,
  Folder,
  Tag,
  Shield,
  Trash2,
  Edit2,
  Terminal,
  Zap,
  HardDrive
} from 'lucide-react';
import type { HostProfile } from '../core/vault/storage';

interface Props {
  hosts: HostProfile[];
  onConnectHost: (host: HostProfile) => void;
  onOpenSFTP: (host: HostProfile) => void;
  onAddHost: () => void;
  onDeleteHost: (id: number) => void;
}

export const HostSidebar: React.FC<Props> = ({
  hosts,
  onConnectHost,
  onOpenSFTP,
  onAddHost,
  onDeleteHost,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    生产集群: true,
    测试环境: true,
    跳板机: true,
    默认分组: true,
  });

  const toggleGroup = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // 分组数据
  const groupedHosts = hosts.reduce<Record<string, HostProfile[]>>((acc, host) => {
    const groupName = host.group || '默认分组';
    if (!acc[groupName]) acc[groupName] = [];
    if (
      !searchTerm ||
      host.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      host.host.includes(searchTerm) ||
      host.tags.some((t) => t.toLowerCase().includes(searchTerm.toLowerCase()))
    ) {
      acc[groupName].push(host);
    }
    return acc;
  }, {});

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-md select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-cyan-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            工作区主机列表
          </span>
        </div>
        <button
          onClick={onAddHost}
          title="新增主机配置"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-cyan-500/20 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 hover:text-cyan-300 transition-all"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 py-2.5">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索主机、IP 或标签..."
            className="w-full rounded-lg border border-slate-800 bg-slate-900/60 py-1.5 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 focus:border-cyan-500/50 focus:outline-none"
          />
        </div>
      </div>

      {/* Tree Content */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-2">
        {Object.keys(groupedHosts).length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-slate-500">未找到匹配的主机</div>
        ) : (
          Object.entries(groupedHosts).map(([groupName, groupHostList]) => {
            if (groupHostList.length === 0) return null;
            const isExpanded = expandedGroups[groupName] !== false;

            return (
              <div key={groupName} className="space-y-1">
                {/* Group Item */}
                <button
                  onClick={() => toggleGroup(groupName)}
                  className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs font-semibold text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    {isExpanded ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-500" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-500" />
                    )}
                    <Folder className="h-3.5 w-3.5 text-cyan-500/70" />
                    <span>{groupName}</span>
                  </div>
                  <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px] font-normal text-slate-400">
                    {groupHostList.length}
                  </span>
                </button>

                {/* Hosts inside group */}
                {isExpanded && (
                  <div className="ml-3 pl-2 border-l border-slate-800/60 space-y-1">
                    {groupHostList.map((host) => (
                      <div
                        key={host.id}
                        className="group relative flex items-center justify-between rounded-lg border border-transparent p-2 text-xs hover:border-slate-800 hover:bg-slate-900/80 transition-all"
                      >
                        <div
                          className="flex flex-1 items-center gap-2.5 cursor-pointer overflow-hidden"
                          onClick={() => onConnectHost(host)}
                        >
                          <div
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: host.color || '#3b82f6' }}
                          />
                          <div className="truncate">
                            <div className="font-medium text-slate-200 group-hover:text-cyan-300 transition-colors truncate">
                              {host.name}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono truncate">
                              {host.username}@{host.host}:{host.port}
                            </div>
                          </div>
                        </div>

                        {/* Hover Quick Actions */}
                        <div className="hidden group-hover:flex items-center gap-1 shrink-0 bg-slate-900/90 pl-1">
                          <button
                            onClick={() => onConnectHost(host)}
                            title="发起 SSH 终端"
                            className="rounded p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                          >
                            <Terminal className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => onOpenSFTP(host)}
                            title="打开 SFTP 文件面板"
                            className="rounded p-1 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                          >
                            <HardDrive className="h-3.5 w-3.5" />
                          </button>
                          {host.id && (
                            <button
                              onClick={() => onDeleteHost(host.id!)}
                              title="删除主机"
                              className="rounded p-1 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Status */}
      <div className="border-t border-slate-800/80 p-3 text-[11px] text-slate-400">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            凭据仅在当前会话
          </span>
          <span className="font-mono text-slate-500">{hosts.length} 项主机</span>
        </div>
      </div>
    </aside>
  );
};
