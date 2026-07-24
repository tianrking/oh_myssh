import React, { useState } from 'react';
import { X, Server, Shield, Key, Sparkles, Terminal } from 'lucide-react';
import type { HostProfile } from '../core/vault/storage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (profile: Partial<HostProfile>) => void;
}

export const QuickConnectModal: React.FC<Props> = ({ isOpen, onClose, onConnect }) => {
  const [connectionString, setConnectionString] = useState('root@de.w0x7ce.eu:22');
  const [authType, setAuthType] = useState<'password' | 'privateKey'>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [group, setGroup] = useState('默认分组');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let username = 'root';
    let host = '127.0.0.1';
    let port = 22;

    try {
      const raw = connectionString.trim();
      let remaining = raw;
      if (remaining.includes('@')) {
        const parts = remaining.split('@');
        username = parts[0];
        remaining = parts[1];
      }
      if (remaining.includes(':')) {
        const parts = remaining.split(':');
        host = parts[0];
        port = parseInt(parts[1], 10) || 22;
      } else {
        host = remaining;
      }
    } catch (err) {
      // fallback
    }

    onConnect({
      name: `${username}@${host}:${port}`,
      host,
      port,
      username,
      authType,
      password,
      privateKey,
      group: group || '默认分组',
      tags: ['QuickConnect'],
    });

    onClose();
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
              <h3 className="font-semibold text-slate-100 text-lg">快速连接主机</h3>
              <p className="text-xs text-slate-400">打开网页即可：user@host:port + 密码 → 浏览器里管 VPS</p>
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
