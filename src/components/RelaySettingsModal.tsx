import React, { useEffect, useState } from 'react';
import { X, Network, ShieldAlert, Check } from 'lucide-react';
import { t } from '../core/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentRelayUrl: string;
  currentAccessToken: string;
  onSaveRelay: (url: string, accessToken: string) => void;
}

export const RelaySettingsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentRelayUrl,
  currentAccessToken,
  onSaveRelay,
}) => {
  const [relayUrl, setRelayUrl] = useState(currentRelayUrl || '');

  useEffect(() => {
    if (!isOpen) return;
    setRelayUrl(currentRelayUrl || '');
  }, [isOpen, currentRelayUrl, currentAccessToken]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveRelay(relayUrl.trim(), '');
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
              <h3 className="font-semibold text-slate-100 text-lg">{t('relaySettingsTitle')}</h3>
              <p className="text-xs text-slate-400">{t('relaySettingsSub')}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-slate-300 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-slate-200">
              <ShieldAlert className="h-4 w-4 text-slate-400" />
              <span>Cloudflare SSH TCP 中继</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              纯 Workers 部署会在同一个地址提供页面和 SSH 中继，浏览器会自动发现同源
              Worker；Vercel 镜像也会自动回退到正式 Worker，因此中继地址通常可以留空。
              SSH 握手、主机指纹、密码、私钥和 SFTP 都在浏览器内完成；中继只转发原始
              SSH 协议字节，不终止或解密 SSH。
            </p>
          </div>

          <div>
            <label className="block text-slate-400 mb-1.5 font-medium">
              {t('relayUrlLabel')}
            </label>
            <input
              type="url"
              value={relayUrl}
              onChange={(e) => setRelayUrl(e.target.value)}
              placeholder={t('relayUrlPlaceholder')}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 font-mono text-cyan-300 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] leading-relaxed text-emerald-200">
            当前 Worker 使用网页登录会话授权，中继访问令牌由服务端保管，用户不需要查看、复制或填写 Cloudflare token。
          </p>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-slate-400 hover:bg-slate-800"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500"
            >
              <Check className="h-4 w-4" />
              {t('applyRelay')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
