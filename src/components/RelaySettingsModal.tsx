import React, { useState } from 'react';
import { X, Network, ShieldAlert, Check } from 'lucide-react';
import { t } from '../core/i18n';

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
              <span>高级可选项 · 默认不需要</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              产品默认像 Xshell 一样直连 VPS，不会自动使用任何中继。
              仅当环境不支持 Direct Sockets、且你明确需要兼容桥接时，才填写下方地址。
              留空 = 不使用。
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
