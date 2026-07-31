import React, { useEffect, useState } from 'react';
import { X, Server, Shield, Key, Sparkles, Terminal } from 'lucide-react';
import type { HostProfile } from '../core/vault/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (profile: Partial<HostProfile>) => void;
  initialProfile?: Partial<HostProfile>;
  connectionType?: 'ssh' | 'sftp';
}

export function parseConnectionString(input: string): {
  username: string;
  host: string;
  port: number;
} {
  const raw = input.trim();
  if (!raw || raw.length > 512) throw new Error('连接地址不能为空');
  const at = raw.lastIndexOf('@');
  const username = at >= 0 ? raw.slice(0, at).trim() : 'root';
  let target = (at >= 0 ? raw.slice(at + 1) : raw).trim();
  if (!username || username.length > 128 || /[\s@]/u.test(username)) {
    throw new Error('SSH 用户名格式无效');
  }
  if (target.includes('://')) throw new Error('SSH 主机地址格式无效');

  let host = '';
  let port = 22;
  if (target.startsWith('[')) {
    const closing = target.indexOf(']');
    if (closing < 2) throw new Error('IPv6 地址缺少右方括号');
    host = target.slice(1, closing);
    const suffix = target.slice(closing + 1);
    if (suffix) {
      if (!suffix.startsWith(':')) throw new Error('IPv6 地址后只能跟 :port');
      port = Number(suffix.slice(1));
    }
  } else {
    const colons = [...target].filter((char) => char === ':').length;
    if (colons === 1) {
      const separator = target.lastIndexOf(':');
      host = target.slice(0, separator);
      port = Number(target.slice(separator + 1));
    } else {
      // Unbracketed IPv6 is accepted with the default SSH port.
      host = target;
    }
  }
  host = host.trim();
  if (!host || /[\s/@?#]/u.test(host)) throw new Error('SSH 主机地址格式无效');
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('SSH 端口必须是 1 到 65535 的整数');
  }
  return { username, host, port };
}

export const QuickConnectModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onConnect,
  initialProfile,
  connectionType = 'ssh',
}) => {
  const [connectionString, setConnectionString] = useState('root@');
  const [authType, setAuthType] = useState<'password' | 'privateKey'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [group, setGroup] = useState('默认分组');
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    const username = initialProfile?.username || 'root';
    const host = initialProfile?.host || '';
    const port = initialProfile?.port || 22;
    const formattedHost = host.includes(':') ? `[${host}]` : host;
    setConnectionString(`${username}@${formattedHost}${host ? `:${port}` : ''}`);
    setAuthType(initialProfile?.authType === 'privateKey' ? 'privateKey' : 'password');
    setGroup(initialProfile?.group || '默认分组');
    setPassword('');
    setPrivateKey('');
    setPassphrase('');
    setValidationError('');
  }, [
    isOpen,
    initialProfile?.id,
    initialProfile?.host,
    initialProfile?.port,
    initialProfile?.username,
    initialProfile?.authType,
    initialProfile?.group,
  ]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { username, host, port } = parseConnectionString(connectionString);
      if (authType === 'password' && !password) throw new Error('请输入 SSH 密码');
      if (authType === 'privateKey' && !privateKey.trim()) throw new Error('请粘贴 SSH 私钥');

      onConnect({
        name: `${username}@${host}:${port}`,
        host,
        port,
        username,
        authType,
        password: authType === 'password' ? password : undefined,
        privateKey: authType === 'privateKey' ? privateKey : undefined,
        passphrase: authType === 'privateKey' ? passphrase : undefined,
        group: group || '默认分组',
        tags: ['QuickConnect'],
      });

      setValidationError('');
      setPassword('');
      setPrivateKey('');
      setPassphrase('');
      onClose();
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/20 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">
                {connectionType === 'sftp' ? '连接 SFTP' : '快速连接主机'}
              </h3>
              <p className="text-xs text-slate-400">
                凭据只保留在当前标签页内，不会写入主机列表
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              连接字符串 (Format: user@host:port)
            </label>
            <div className="relative">
              <Server className="absolute left-3.5 top-3 h-4 w-4 text-cyan-400" />
              <input
                type="text"
                required
                value={connectionString}
                onChange={(e) => setConnectionString(e.target.value)}
                placeholder="root@host:22"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 py-2.5 pl-10 pr-4 text-sm text-cyan-300 font-mono focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              认证类型
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAuthType('password')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-medium border transition-all ${
                  authType === 'password'
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Shield className="h-4 w-4" /> 密码认证
              </button>
              <button
                type="button"
                onClick={() => setAuthType('privateKey')}
                className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs font-medium border transition-all ${
                  authType === 'privateKey'
                    ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Key className="h-4 w-4" /> SSH 私钥 (Ed25519/RSA)
              </button>
            </div>
          </div>

          {authType === 'password' ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 py-2.5 px-4 text-sm text-slate-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">私钥内容 (PEM/OpenSSH)</label>
              <textarea
                rows={3}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
                placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 py-2.5 px-4 text-xs font-mono text-cyan-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
              <input
                type="password"
                value={passphrase}
                onChange={(event) => setPassphrase(event.target.value)}
                placeholder="私钥口令（没有则留空；OpenSSH 加密私钥请转 PKCS#8）"
                autoComplete="off"
                className="mt-2 w-full rounded-xl border border-slate-700/60 bg-slate-950/60 py-2.5 px-4 text-xs font-mono text-cyan-200 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              />
            </div>
          )}

          {validationError && (
            <div role="alert" className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {validationError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">归属分组</label>
            <input
              type="text"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              placeholder="默认分组"
              className="w-full rounded-xl border border-slate-700/60 bg-slate-950/60 py-2 px-4 text-xs text-slate-300 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500 transition-all active:scale-[0.98]"
            >
              <Terminal className="h-4 w-4" /> 立即发起连接
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
