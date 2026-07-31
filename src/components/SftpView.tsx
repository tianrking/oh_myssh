import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  KeyRound,
} from 'lucide-react';
import type { TabItem } from './WorkspaceTabs';
import { opfsEngine } from '../core/sftp/opfs';
import { connectSftpSession, type SftpSshSession } from '../core/ssh/client';
import type { SftpClient, SftpEntry } from '../core/ssh/sftp-client';

interface FileItem {
  name: string;
  isDir: boolean;
  sizeBytes: number;
  size: string;
  updatedAt: string;
  permissions: string;
}

interface TransferTask {
  id: string;
  fileName: string;
  direction: 'upload' | 'download';
  progress: number;
  transferredBytes: number;
  totalBytes: number;
  status: 'transferring' | 'completed' | 'error';
}

interface Props {
  tab: TabItem;
  relayUrl?: string;
  relayAccessToken?: string;
}

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function transferPercent(transferredBytes: number, totalBytes: number): number {
  if (totalBytes <= 0) return 0;
  return Math.min(99, Math.max(0, Math.floor((transferredBytes / totalBytes) * 100)));
}

function remoteChildPath(parent: string, name: string): string {
  const base = parent.replace(/\/+$/, '');
  return `${base || ''}/${name}`;
}

function formatTime(ts: number): string {
  if (!ts) return '-';
  try {
    return new Date(ts * 1000).toISOString().slice(0, 16).replace('T', ' ');
  } catch {
    return '-';
  }
}

function modeString(mode: number, isDir: boolean): string {
  if (!mode) return isDir ? 'drwxr-xr-x' : '-rw-r--r--';
  const chars = isDir ? 'd' : '-';
  const perms = mode & 0o777;
  const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
  return (
    chars +
    map[(perms >> 6) & 7] +
    map[(perms >> 3) & 7] +
    map[perms & 7]
  );
}

function toFileItems(entries: SftpEntry[]): FileItem[] {
  return [
    { name: '..', isDir: true, sizeBytes: 0, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
    ...entries.map((e) => ({
      name: e.name,
      isDir: e.isDir,
      sizeBytes: e.size,
      size: e.isDir ? '-' : formatSize(e.size),
      updatedAt: formatTime(e.mtime),
      permissions: modeString(e.permissions, e.isDir),
    })),
  ];
}

export const SftpView: React.FC<Props> = ({ tab, relayUrl, relayAccessToken }) => {
  const [remotePath, setRemotePath] = useState('.');
  const [localPath] = useState('OPFS:/');
  const [remoteFiles, setRemoteFiles] = useState<FileItem[]>([]);
  const [localFiles, setLocalFiles] = useState<FileItem[]>([
    { name: '..', isDir: true, sizeBytes: 0, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
  ]);
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const [opfsReady, setOpfsReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [sftpReady, setSftpReady] = useState(false);
  const [password, setPassword] = useState(tab.password || '');
  const [connecting, setConnecting] = useState(false);

  const sshRef = useRef<SftpSshSession | null>(null);
  const sftpRef = useRef<SftpClient | null>(null);

  const refreshLocal = useCallback(async () => {
    try {
      if (!opfsEngine.supported) {
        throw new Error('当前浏览器不支持 OPFS，本地 SFTP 文件区不可用');
      }
      const entries = await opfsEngine.listDirectory();
      setLocalFiles([
        { name: '..', isDir: true, sizeBytes: 0, size: '-', updatedAt: '-', permissions: 'drwxr-xr-x' },
        ...entries.map((entry) => ({
          name: entry.name,
          isDir: entry.isDir,
          sizeBytes: entry.size,
          size: entry.isDir ? '-' : formatSize(entry.size),
          updatedAt: entry.updatedAt
            ? new Date(entry.updatedAt).toISOString().slice(0, 16).replace('T', ' ')
            : '-',
          permissions: entry.isDir ? 'drwxr-xr-x' : '-rw-r--r--',
        })),
      ]);
      setOpfsReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLocalFiles([]);
      setOpfsReady(false);
      setStatusMsg(`Local storage error: ${message}`);
    }
  }, []);

  const refreshRemote = useCallback(async (path?: string) => {
    const sftp = sftpRef.current;
    if (!sftp) return;
    const p = path ?? remotePath;
    try {
      const entries = await sftp.list(p);
      setRemoteFiles(toFileItems(entries));
      setRemotePath(p);
      setStatusMsg(`Listed ${entries.length} items in ${p}`);
    } catch (e) {
      setStatusMsg(`List failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [remotePath]);

  const connectSftp = useCallback(async () => {
    if (!password && !tab.privateKey) {
      setStatusMsg('请输入 SSH 密码以连接 SFTP');
      return;
    }
    setConnecting(true);
    setSftpReady(false);
    setStatusMsg('Connecting SFTP…');
    try {
      await sftpRef.current?.close().catch(() => undefined);
      sftpRef.current = null;
      await sshRef.current?.close().catch(() => {});
      sshRef.current = null;
      const ssh = await connectSftpSession({
        host: tab.host,
        port: tab.port,
        auth: {
          username: tab.username,
          password: password || tab.password,
          privateKeyPem: tab.privateKey,
          privateKeyPassphrase: tab.privateKeyPassphrase,
        },
        relayUrl: relayUrl || undefined,
        relayAccessToken,
        onStatus: (m) => setStatusMsg(m),
      });
      sshRef.current = ssh;
      const sftp = ssh.client;
      sftpRef.current = sftp;
      const home = await sftp.realpath('.');
      setRemotePath(home);
      setSftpReady(true);
      const entries = await sftp.list(home);
      setRemoteFiles(toFileItems(entries));
      setStatusMsg(`SFTP connected · ${tab.username}@${tab.host} · ${home}`);
    } catch (e) {
      await sftpRef.current?.close().catch(() => undefined);
      sftpRef.current = null;
      await sshRef.current?.close().catch(() => undefined);
      sshRef.current = null;
      setSftpReady(false);
      setStatusMsg(`SFTP error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConnecting(false);
    }
  }, [password, tab, relayUrl, relayAccessToken]);

  useEffect(() => {
    void refreshLocal();
    return () => {
      void sftpRef.current?.close();
      void sshRef.current?.close();
    };
  }, [refreshLocal]);

  // Auto-connect if password already on tab
  useEffect(() => {
    if (tab.password || tab.privateKey) {
      void connectSftp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  const pushTransfer = (task: TransferTask) => {
    setTransfers((prev) => [task, ...prev].slice(0, 20));
  };

  const updateTransfer = (id: string, patch: Partial<TransferTask>) => {
    setTransfers((previous) =>
      previous.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );
  };

  const handleUpload = async (fileName: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushTransfer({
      id,
      fileName,
      direction: 'upload',
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'transferring',
    });
    try {
      const sftp = sftpRef.current;
      if (!sftp) throw new Error('SFTP is not connected');
      if (!opfsEngine.supported) throw new Error('OPFS is unavailable; upload cannot start');

      // Metadata and stream come from the same immutable File snapshot, so
      // progress and the final byte-count check cannot race a local rewrite.
      const localFile = await opfsEngine.openFileForReading(fileName);
      updateTransfer(id, { totalBytes: localFile.size });

      const remoteFile = remoteChildPath(remotePath, fileName);
      const written = await sftp.writeFileStream(remoteFile, localFile.stream, (bytesWritten) => {
        updateTransfer(id, {
          transferredBytes: bytesWritten,
          totalBytes: localFile.size,
          progress: transferPercent(bytesWritten, localFile.size),
        });
      });
      if (written !== localFile.size) {
        throw new Error(`Upload byte count mismatch: expected ${localFile.size}, wrote ${written}`);
      }

      updateTransfer(id, {
        progress: 100,
        transferredBytes: written,
        totalBytes: localFile.size,
        status: 'completed',
      });
      await refreshRemote();
      setStatusMsg(`Uploaded ${fileName} · ${formatSize(written)}`);
    } catch (e) {
      updateTransfer(id, { status: 'error' });
      setStatusMsg(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleDownload = async (fileName: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    pushTransfer({
      id,
      fileName,
      direction: 'download',
      progress: 0,
      transferredBytes: 0,
      totalBytes: 0,
      status: 'transferring',
    });
    try {
      const sftp = sftpRef.current;
      if (!sftp) throw new Error('SFTP is not connected');
      if (!opfsEngine.supported) throw new Error('OPFS is unavailable; download cannot start');

      const remoteFile = remoteChildPath(remotePath, fileName);
      const attributes = await sftp.stat(remoteFile);
      let totalBytes = attributes.size;
      updateTransfer(id, { totalBytes });

      const stream = await sftp.readFileStream(remoteFile, (_bytesRead, reportedTotal) => {
        if (reportedTotal !== totalBytes) {
          totalBytes = reportedTotal;
          updateTransfer(id, { totalBytes });
        }
      });
      const written = await opfsEngine.writeStreamToFile(fileName, stream, (bytesWritten) => {
        updateTransfer(id, {
          transferredBytes: bytesWritten,
          totalBytes,
          progress: transferPercent(bytesWritten, totalBytes),
        });
      });
      if (written !== totalBytes) {
        throw new Error(`Download byte count mismatch: expected ${totalBytes}, saved ${written}`);
      }

      updateTransfer(id, {
        progress: 100,
        transferredBytes: written,
        totalBytes,
        status: 'completed',
      });
      await refreshLocal();
      setStatusMsg(`Downloaded ${fileName} → OPFS · ${formatSize(written)}`);
    } catch (e) {
      updateTransfer(id, { status: 'error' });
      setStatusMsg(`Download failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleRemoteClick = async (file: FileItem) => {
    if (!file.isDir || !sftpRef.current) return;
    if (file.name === '..') {
      const parent = remotePath.replace(/\/+$/, '').split('/').slice(0, -1).join('/') || '/';
      await refreshRemote(parent || '/');
    } else {
      const next = remoteChildPath(remotePath, file.name);
      await refreshRemote(next);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-950 text-slate-200">
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <HardDrive className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="font-semibold text-slate-100">SFTP</span>
          <span className="font-mono text-[11px] text-slate-400 truncate">
            {tab.username}@{tab.host}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] border shrink-0 ${
              sftpReady
                ? 'border-emerald-500/30 text-emerald-300 bg-emerald-500/10'
                : 'border-amber-500/30 text-amber-300 bg-amber-500/10'
            }`}
          >
            {sftpReady ? 'SSH SFTP' : '未连接'}
          </span>
        </div>

        {!sftpReady && (
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-slate-500" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="SSH 密码"
              className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] w-32"
              onKeyDown={(e) => e.key === 'Enter' && void connectSftp()}
            />
            <button
              disabled={connecting}
              onClick={() => void connectSftp()}
              className="rounded-lg bg-emerald-600/80 px-3 py-1 text-[11px] font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {connecting ? '连接中…' : '连接 SFTP'}
            </button>
          </div>
        )}

        {statusMsg && (
          <span className="text-[11px] text-slate-400 truncate max-w-md hidden lg:inline">
            {statusMsg}
          </span>
        )}
      </div>

      <div className="grid flex-1 grid-cols-2 divide-x divide-slate-800 overflow-hidden p-2 gap-2">
        {/* Local OPFS */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 flex-1 min-w-0">
              <HardDrive className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{localPath}{opfsReady ? '' : ' (不可用)'}</span>
            </div>
            <button onClick={() => void refreshLocal()} className="rounded p-1 hover:bg-slate-800 text-slate-400">
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-slate-800 text-[10px] uppercase text-slate-500">
                  <th className="pb-2 pl-2">名称</th>
                  <th className="pb-2">大小</th>
                  <th className="pb-2 text-right pr-2">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {localFiles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-2 py-6 text-center text-[11px] text-rose-300">
                      本地 OPFS 存储不可用，请查看顶部错误信息
                    </td>
                  </tr>
                )}
                {localFiles.map((file, idx) => (
                  <tr key={idx} className="group hover:bg-slate-800/60">
                    <td className="py-2 pl-2 flex items-center gap-2">
                      {file.isDir ? (
                        <Folder className="h-4 w-4 text-cyan-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-400" />
                      )}
                      <span className={file.isDir ? 'text-cyan-200 font-semibold' : ''}>{file.name}</span>
                    </td>
                    <td className="py-2 text-slate-400 text-[11px]">{file.size}</td>
                    <td className="py-2 text-right pr-2">
                      {!file.isDir && file.name !== '..' && opfsReady && sftpReady && (
                        <button
                          onClick={() => void handleUpload(file.name)}
                          className="rounded p-1 text-slate-400 hover:bg-emerald-500/20 hover:text-emerald-300"
                          title="上传"
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

        {/* Remote */}
        <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900/40 overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-3 py-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-emerald-300 flex-1 min-w-0">
              <Server className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              <input
                type="text"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void refreshRemote(remotePath)}
                className="bg-transparent focus:outline-none w-full truncate"
              />
            </div>
            <button
              onClick={() => void refreshRemote()}
              className="rounded p-1 hover:bg-slate-800 text-slate-400"
              disabled={!sftpReady}
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {!sftpReady ? (
              <div className="p-6 text-center text-xs text-slate-500">连接 SFTP 后浏览远程文件</div>
            ) : (
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
                    <tr
                      key={idx}
                      className="group hover:bg-slate-800/60 cursor-pointer"
                      onDoubleClick={() => void handleRemoteClick(file)}
                    >
                      <td className="py-2 pl-2 flex items-center gap-2">
                        {file.isDir ? (
                          <Folder className="h-4 w-4 text-emerald-400" />
                        ) : (
                          <FileText className="h-4 w-4 text-slate-400" />
                        )}
                        <span
                          className={file.isDir ? 'text-emerald-200 font-semibold' : ''}
                          onClick={() => void handleRemoteClick(file)}
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
                            className="rounded p-1 text-slate-400 hover:bg-cyan-500/20 hover:text-cyan-300"
                            title="下载到 OPFS"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="h-28 border-t border-slate-800 bg-slate-900/90 p-3 font-mono text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="flex items-center gap-1.5 font-semibold text-slate-300 text-[11px]">
            <Clock className="h-3.5 w-3.5 text-cyan-400" />
            传输队列 ({transfers.length})
          </span>
          <span className="text-[10px] text-slate-500">SFTP v3 · 流式传输 · OPFS 本地文件区</span>
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
                      className={`h-full ${
                        t.status === 'completed'
                          ? 'bg-emerald-400'
                          : t.status === 'error'
                            ? 'bg-rose-400'
                            : 'bg-cyan-400'
                      }`}
                      style={{ width: `${t.progress}%` }}
                    />
                  </div>
                  <span className="w-32 text-right text-[10px] text-slate-400">
                    {formatSize(t.transferredBytes)} / {formatSize(t.totalBytes)} · {t.progress}%
                  </span>
                  {t.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
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
