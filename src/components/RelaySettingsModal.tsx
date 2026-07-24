import React, { useState } from 'react';
import { X, Network, ShieldAlert, Check, HelpCircle, ExternalLink } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentRelayUrl: string;
  onSaveRelayUrl: (url: string) => void;
}

export const RelaySettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentRelayUrl,
  onSaveRelayUrl,
}) => {
  const [relayUrl, setRelayUrl] = useState(currentRelayUrl || '');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRelayUrl(relayUrl.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Network className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">WebSocket SSH Relay 中继代理</h3>
              <p className="text-xs text-slate-400">在普通网页模式下配置连接真实 SSH 服务器的网关</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              <span>纯前端网络限制提示</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed">
              根据 W3C 安全限制，普通网页不能直接发起原始 TCP 连接。若要在普通网页中直连真实服务器，请安装为 <strong>Chromium Isolated Web App (IWA)</strong>，或在此处配置自建的 WebSocket Relay 网关（如 <code>wss://relay.yourdomain.com/ssh</code>）。
            </p>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              WebSocket Relay 网关地址 (WebSocket Gateway URL)
            </label>
            <input
              type="url"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder="wss://relay.ohmyssh.local/ssh"
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-400 hover:bg-slate-800"
            >
              取消
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500"
            >
              <Check className="h-4 w-4" />
              应用 Relay 配置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
