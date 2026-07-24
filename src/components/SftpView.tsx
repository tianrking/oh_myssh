import React, { useEffect, useState, useCallback } from 'react';
import {
  Folder,
  FileText,
  Upload,
  Download,
  RefreshCw,
  HardDrive,
  Server,
  CheckCircle2,
  Clock,
  AlertCircle,
} from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';
import { opfsEngine } from '../core/sftp/opfs';

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
  status: 'transferring' | 'completed' | 'error';
}

interface Props {
  tab: TabItem;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return '-';
  }
}

const REMOTE_SEED: FileItem[] = [
  { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
  { name: 'src', isDir: true, size: '-', updatedAt: '2026-07-24 10:30', permissions: 'drwxr-xr-x' },
  { name: 'public', isDir: true, size: '-', updatedAt: '2026-07-24 10:20', permissions: 'drwxr-xr-x' },
  {
    name: 'docker-compose.yml',
    isDir: false,
    size: '2.4 KB',
    updatedAt: '2026-07-23 18:45',
    permissions: '-rw-r--r--',
  },
  {
    name: 'nginx.conf',
    isDir: false,
    size: '1.2 KB',
    updatedAt: '2026-07-22 14:10',
    permissions: '-rw-r--r--',
  },
  {
    name: 'app_bundle.wasm',
    isDir: false,
    size: '4.8 MB',
    updatedAt: '2026-07-24 09:15',
    permissions: '-rw-r--r--',
  },
  {
    name: '.env.production',
    isDir: false,
    size: '820 B',
    updatedAt: '2026-07-20 11:00',
    permissions: '-rw-------',
  },
];

export const SftpView: React.FC<Props> = ({ tab }) => {
  const [remotePath, setRemotePath] = useState('/var/www/html');
  const [localPath, setLocalPath] = useState('OPFS:/');
  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>(REMOTE_SEED);
  const [localFiles, setLocalFiles] = useState<FileItem[]>([
    { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
  ]);
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const [opfsReady, setOpfsReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const refreshLocal = useCallback(async () => {
    if (!opfsEngine.supported) {
      setLocalFiles([
        { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
        {
          name: '(OPFS unsupported — in-memory demo)',
          isDir: false,
          size: '-',
          updatedAt: '-',
          permissions: '----------',
        },
      ]);
      setOpfsReady(false);
      return;
    }

    await opfsEngine.ensureDemoFiles();
    const entries = await opfsEngine.listDirectory();
    setLocalFiles([
      { name: '..', isDir: true, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
      ...entries.map((e) => ({
        name: e.name,
        isDir: e.isDir,
        size: e.isDir ? '-' : formatSize(e.size),
        updatedAt: formatTime(e.updatedAt),
        permissions: e.isDir ? 'drwxr-xr-x' : '-rw-r--r--',
      })),
    ]);
    setOpfsReady(true);
    setLocalPath('OPFS:/');
  }, []);

  useEffect(() => {
    void refreshLocal();
  }, [refreshLocal]);

  const pushTransfer = (task: TransferTask) => {
    setTransfers((prev) => [task, ...prev].slice(0, 20));
  };

  const handleUpload = async (fileName: string) => {
    const id = Date.now().toString();
    pushTransfer({
      id,
      fileName,
      direction: 'upload',
      progress: 10,
      status: 'transferring',
    });

    // Simulate stream transfer with progress ticks
    for (const p of [35, 60, 85, 100]) {
      await new Promise((r) => setTimeout(r, 180));
      setTransfers((prev) =>
        prev.map((t) =>
          t.id === id
            ? { ...t, progress: p, status: p === 100 ? 'completed' : 'transferring' }
            : t
        )
      );
    }

    setRemoteFiles((prev) => {
      if (prev.some((f) => f.name === fileName)) return prev;
      return [
        ...prev,
        {
          name: fileName,
          isDir: false,
          size: '1.0 KB',
          updatedAt: formatTime(Date.now()),
          permissions: '-rw-r--r--',
        },
      ];
    });
    setStatusMsg(`Uploaded ${fileName} → ${tab.host}:${remotePath}`);
  };

  const handleDownload = async (fileName: string) => {
    const id = Date.now().toString();
    pushTransfer({
      id,
      fileName,
      direction: 'download',
      progress: 15,
      status: 'transferring',
    });

    try {
      const content = `# offline download of ${fileName}\nfrom ${tab.username}@${tab.host}${remotePath}\n`;
      if (opfsEngine.supported) {
        await opfsEngine.writeTextFile(fileName, content);
      }
      for (const p of [40, 70, 100]) {
        await new Promise((r) => setTimeout(r, 150));
        setTransfers((prev) =>
          prev.map((t) =>
            t.id === id
              ? { ...t, progress: p, status: p === 100 ? 'completed' : 'transferring' }
              : t
          )
        );
      }
      await refreshLocal();
      setStatusMsg(`Downloaded ${fileName} → OPFS`);
    } catch (e) {
      setTransfers((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: 'error', progress: 0 } : t))
      );
      setStatusMsg(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs">
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-emerald-400" />
          <span className="font-semibold text-slate-100">双栏 SFTP</span>
          <span className="font-mono text-[11px] text-slate-400">
            ({tab.username}@{tab.host})
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] border ${
              opfsReady
                ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-300 bg-amber-500/10'
            }`}
          >
            {opfsReady ? 'OPFS 就绪' : 'OPFS 降级'}
          </span>
        </div>

        {statusMsg && (
          <span className="text-[11px] text-slate-400 truncate max-w-md">{statusMsg}</span>
        )}
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-slate-800 overflow-hidden p-2 gap-2">
        {/* Local OPFS */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 flex-1 min-w-0">
              <HardDrive className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <input
                type="text"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                className="bg-transparent focus:outline-none w-full truncate"
              />
            </div>
            <button
              onClick={() => void refreshLocal()}
              className="rounded p-1 hover:bg-slate-800 text-slate-400"
              title="刷新本地 OPFS"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="pb-2 pl-2">名称</th>
                  <th className="pb-2">大小</th>
                  <th className="pb-2">修改</th>
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
                      {!file.isDir && file.name !== '..' && !file.name.startsWith('(') && (
                        <button
                          onClick={() => void handleUpload(file.name)}
                          title="上传至远端"
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

        {/* Remote (offline mock channel listing) */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300 flex-1 min-w-0">
              <Server className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                className="bg-transparent focus:outline-none w-full truncate"
              />
            </div>
            <button
              onClick={() => setRemoteFiles(REMOTE_SEED)}
              className="rounded p-1 hover:bg-slate-800 text-slate-400"
              title="刷新远端列表"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>

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
                      <span
                        className={file.isDir ? 'font-semibold text-emerald-200' : 'text-slate-200'}
                      >
                        {file.name}
                      </span>
                    </td>
                    <td className="py-2 text-slate-500 text-[10px]">{file.permissions}</td>
                    <td className="py-2 text-slate-400 text-[11px]">{file.size}</td>
                    <td className="py-2 text-right pr-2">
                      {!file.isDir && file.name !== '..' && (
                        <button
                          onClick={() => void handleDownload(file.name)}
                          title="下载到 OPFS"
                          className="rounded p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="h-28 border-t border-slate-800 bg-slate-900/90 p-3 font-mono text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            传输队列 ({transfers.length})
          </span>
          <span className="text-[10px] text-slate-500">
            Offline SFTP 模拟 · 本地侧使用 OPFS 流式写入
          </span>
        </div>

        <div className="space-y-2 overflow-y-auto max-h-16">
          {transfers.length === 0 ? (
            <div className="text-[11px] text-slate-600 px-1">暂无传输任务</div>
          ) : (
            transfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 text-[11px] text-slate-300 bg-slate-950/60 p-1.5 rounded-lg border border-slate-800"
              >
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
                        t.status === 'completed'
                          ? 'bg-emerald-400'
                          : t.status === 'error'
                            ? 'bg-rose-400'
                            : 'bg-cyan-400'
                      }`}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-[10px] text-slate-400">{t.progress}%</span>
                  {t.status === 'completed' && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  {t.status === 'error' && <AlertCircle className="h-3.5 w-3.5 text-rose-400" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
