import React, { useState } from 'react';
import {
  Folder,
  FileText,
  Upload,
  Download,
  RefreshCw,
  ArrowUp,
  HardDrive,
  Server,
  Plus,
  Trash2,
  Eye,
  CheckCircle2,
  Clock
} from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';

interface FileItem {
  name: string;
  isDir: boolean;
  size: string;
  updatedAt: string;
  permissions: string;
}

interface TransferTask {
  id: string;
  fileName: string;
  direction: 'upload' | 'download';
  progress: number;
  status: 'transferring' | 'completed';
}

interface Props {
  tab: TabItem;
}

export const SftpView: React.FC<Props> = ({ tab }) => {
  const [remotePath, setRemotePath] = useState('/var/www/oh_myssh');
  const [localPath, setLocalPath] = useState('/Local Workspace/Downloads');

  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>([
    { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
    { name: 'src', isDir: true, size: '-', updatedAt: '2026-07-24 10:30', permissions: 'drwxr-xr-x' },
    { name: 'public', isDir: true, size: '-', updatedAt: '2026-07-24 10:20', permissions: 'drwxr-xr-x' },
    { name: 'docker-compose.yml', isDir: false, size: '2.4 KB', updatedAt: '2026-07-23 18:45', permissions: '-rw-r--r--' },
    { name: 'nginx.conf', isDir: false, size: '1.2 KB', updatedAt: '2026-07-22 14:10', permissions: '-rw-r--r--' },
    { name: 'app_bundle.wasm', isDir: false, size: '4.8 MB', updatedAt: '2026-07-24 09:15', permissions: '-rw-r--r--' },
    { name: '.env.production', isDir: false, size: '820 B', updatedAt: '2026-07-20 11:00', permissions: '-rw-------' },
  ]);

  const [localFiles, setLocalFiles] = useState<FileItem[]>([
    { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
    { name: 'oh_myssh_v1.0.iwa', isDir: false, size: '8.4 MB', updatedAt: '2026-07-24 10:00', permissions: '-rw-r--r--' },
    { name: 'backup_keys.pem', isDir: false, size: '1.8 KB', updatedAt: '2026-07-23 20:30', permissions: '-rw-------' },
    { name: 'release_notes.txt', isDir: false, size: '450 B', updatedAt: '2026-07-24 08:00', permissions: '-rw-r--r--' },
  ]);

  const [transfers, setTransfers] = useState<TransferTask[]>([
    { id: '1', fileName: 'app_bundle.wasm', direction: 'download', progress: 100, status: 'completed' },
    { id: '2', fileName: 'oh_myssh_v1.0.iwa', direction: 'upload', progress: 75, status: 'transferring' },
  ]);

  const handleSimulateUpload = (fileName: string) => {
    const newTask: TransferTask = {
      id: Date.now().toString(),
      fileName,
      direction: 'upload',
      progress: 20,
      status: 'transferring',
    };
    setTransfers((prev) => [newTask, ...prev]);

    setTimeout(() => {
      setTransfers((prev) =>
        prev.map((t) => (t.id === newTask.id ? { ...t, progress: 100, status: 'completed' } : t))
      );
      setRemoteFiles((prev) => [
        ...prev,
        {
          name: fileName,
          isDir: false,
          size: '3.5 MB',
          updatedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
          permissions: '-rw-r--r--',
        },
      ]);
    }, 1200);
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-200">
      {/* SFTP Header */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-slate-100">双栏 SFTP 文件传输向导</span>
          <span className="font-mono text-[11px] text-slate-400">
            ({tab.username}@{tab.host})
          </span>
        </div>

        <button
          onClick={() => handleSimulateUpload('demo_upload_file.tar.gz')}
          className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/20 transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          <span>测试流式上传文件</span>
        </button>
      </div>

      {/* Main Dual Pane Container */}
      <div className="grid flex-1 grid-cols-2 divide-x divide-slate-800 overflow-hidden p-2 gap-2">
        {/* Left Pane: Local System / OPFS */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          {/* Path Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300">
              <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="bg-transparent focus:outline-none w-full"
              />
            </div>
            <button className="rounded p-1 hover:bg-slate-800 text-slate-400">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="pb-2 pl-2">名称</th>
                  <th className="pb-2">大小</th>
                  <th className="pb-2">修改日期</th>
                  <th className="pb-2 text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {localFiles.map((file, idx) => (
                  <tr key={idx} className="group hover:bg-slate-800/60 transition-colors">
                    <td className="py-2 pl-2 flex items-center gap-2">
                      {file.isDir ? (
                        <Folder className="h-4 w-4 text-cyan-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-400" />
                      )}
                      <span className={file.isDir ? 'font-semibold text-cyan-200' : 'text-slate-200'}>
                        {file.name}
                      </span>
                    </td>
                    <td className="py-2 text-slate-400 text-[11px]">{file.size}</td>
                    <td className="py-2 text-slate-500 text-[10px]">{file.updatedAt}</td>
                    <td className="py-2 text-right pr-2">
                      {!file.isDir && file.name !== '..' && (
                        <button
                          onClick={() => handleSimulateUpload(file.name)}
                          title="上传至服务器"
                          className="rounded p-1 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                        >
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Pane: Remote Host Files */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          {/* Path Header */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300">
              <Server className="h-3.5 w-3.5 text-emerald-400" />
              <input
                type="text"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                className="bg-transparent focus:outline-none w-full"
              />
            </div>
            <button className="rounded p-1 hover:bg-slate-800 text-slate-400">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Remote File List */}
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="pb-2 pl-2">名称</th>
                  <th className="pb-2">权限</th>
                  <th className="pb-2">大小</th>
                  <th className="pb-2 text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {remoteFiles.map((file, idx) => (
                  <tr key={idx} className="group hover:bg-slate-800/60 transition-colors">
                    <td className="py-2 pl-2 flex items-center gap-2">
                      {file.isDir ? (
                        <Folder className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-400" />
                      )}
                      <span className={file.isDir ? 'font-semibold text-emerald-200' : 'text-slate-200'}>
                        {file.name}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500 text-[10px]">{file.permissions}</td>
                    <td className="py-2 text-slate-400 text-[11px]">{file.size}</td>
                    <td className="py-2 text-right pr-2">
                      {!file.isDir && file.name !== '..' && (
                        <div className="flex justify-end gap-1">
                          <button
                            title="下载到本地"
                            className="rounded p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title="查看预览"
                            className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-slate-200"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Transfer Queue Drawer */}
      <div className="h-28 border-t border-slate-800 bg-slate-900/90 p-3 font-mono text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            后台流式传输队列 ({transfers.length} 项)
          </span>
          <span className="text-[10px] text-slate-500">Streams + OPFS 背压防爆内存机制激活</span>
        </div>

        <div className="space-y-2 overflow-y-auto max-h-16">
          {transfers.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 text-[11px] text-slate-300 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800">
              <div className="flex items-center gap-2 truncate">
                {t.direction === 'upload' ? (
                  <Upload className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <Download className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                )}
                <span className="truncate">{t.fileName}</span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="w-32 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      t.status === 'completed' ? 'bg-emerald-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${t.progress}%` }}
                  />
                </div>
                <span className="w-8 text-right text-[10px] text-slate-400">{t.progress}%</span>
                {t.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
