import React, { useState } from 'react';
import { LockKeyhole, ShieldCheck, Terminal } from 'lucide-react';
import { loginWithPassword } from '../core/auth';

type Props = {
  status: 'checking' | 'required' | 'unavailable';
  onAuthenticated: () => void;
};

export const AuthGate: React.FC<Props> = ({ status, onAuthenticated }) => {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (status === 'checking') {
    return (
      <div className="grid h-screen w-screen place-items-center bg-slate-950 text-slate-300">
        <div className="flex items-center gap-3 text-sm">
          <Terminal className="h-5 w-5 animate-pulse text-cyan-400" />
          正在连接 Cloudflare Worker…
        </div>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="grid min-h-screen w-screen place-items-center bg-slate-950 px-6 text-slate-100">
        <div className="w-full max-w-md rounded-3xl border border-amber-500/20 bg-slate-900/80 p-8 shadow-2xl">
          <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold">请打开正式 Worker 入口</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">
            这个页面没有检测到 Cloudflare Worker 登录接口。正式产品入口是
            <a className="mx-1 text-cyan-300 underline" href="https://ssh.w0x7ce.eu">ssh.w0x7ce.eu</a>，不需要下载或运行任何本地程序。
          </p>
          <a
            className="mt-6 inline-flex rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            href="https://ssh.w0x7ce.eu"
          >
            打开正式入口
          </a>
        </div>
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const result = await loginWithPassword(password);
    setBusy(false);
    if (result.ok) {
      setPassword('');
      onAuthenticated();
    } else {
      setError(result.message);
    }
  };

  return (
    <div className="grid min-h-screen w-screen place-items-center bg-slate-950 px-6 text-slate-100">
      <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-cyan-500/20 bg-slate-900/85 p-8 shadow-2xl shadow-cyan-950/30">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-400/30 bg-cyan-400/10 text-cyan-300">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Oh My SSH</p>
            <h1 className="text-xl font-bold">进入安全工作区</h1>
          </div>
        </div>
        <p className="mb-6 text-sm leading-6 text-slate-400">
          这是 Cloudflare Worker 的网页登录。登录后会话由 HttpOnly Cookie 保护，SSH 密码和私钥只留在当前浏览器内。
        </p>
        <label className="block text-sm font-medium text-slate-300" htmlFor="app-login-password">
          登录密码
        </label>
        <input
          id="app-login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-3 text-sm text-cyan-100 outline-none transition focus:border-cyan-400"
          placeholder="输入产品登录密码"
        />
        {error && <p className="mt-3 text-sm text-rose-300" role="alert">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:from-cyan-300 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? '正在验证…' : '登录并进入工作区'}
        </button>
      </form>
    </div>
  );
};
