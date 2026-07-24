import React, { useState } from 'react';
import { X, Settings, Shield, Terminal, Cpu, Clock, Type } from 'lucide-react';
import { t } from '../core/i18n';

interface SessionSettings {
  termType: string;
  encoding: string;
  keepAliveSeconds: number;
  scrollback: number;
  fontSize: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (settings: SessionSettings) => void;
  initialSettings?: Partial<SessionSettings>;
}

export const SessionPropertiesModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onSave,
  initialSettings,
}) => {
  const [termType, setTermType] = useState(initialSettings?.termType || 'xterm-256color');
  const [encoding, setEncoding] = useState(initialSettings?.encoding || 'UTF-8');
  const [keepAliveSeconds, setKeepAliveSeconds] = useState(initialSettings?.keepAliveSeconds || 30);
  const [scrollback, setScrollback] = useState(initialSettings?.scrollback || 10000);
  const [fontSize, setFontSize] = useState(initialSettings?.fontSize || 14);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      termType,
      encoding,
      keepAliveSeconds,
      scrollback,
      fontSize,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Settings className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">Xshell 高级会话属性设置</h3>
              <p className="text-xs text-slate-400">配置 Terminal 仿真、字符集编码与心跳重连</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                终端类型 (Terminal Type)
              </label>
              <select
                value={termType}
                onChange={(e) => setTermType(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-cyan-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="xterm-256color">xterm-256color (推荐)</option>
                <option value="vt100">vt100</option>
                <option value="ansi">ansi</option>
                <option value="xterm">xterm</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-emerald-400" />
                字符集编码 (Encoding)
              </label>
              <select
                value={encoding}
                onChange={(e) => setEncoding(e.target.value)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-emerald-300 focus:outline-none focus:border-cyan-500"
              >
                <option value="UTF-8">UTF-8 (Unicode)</option>
                <option value="GBK">GBK / GB2312 (中文大字符集)</option>
                <option value="ISO-8859-1">ISO-8859-1 (Latin1)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                KeepAlive 探测心跳 (秒)
              </label>
              <input
                type="number"
                value={keepAliveSeconds}
                onChange={(e) => setKeepAliveSeconds(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1 font-medium flex items-center gap-1.5">
                <Cpu className="h-3.5 w-3.5 text-purple-400" />
                历史滚屏上限 (Scrollback)
              </label>
              <input
                type="number"
                value={scrollback}
                onChange={(e) => setScrollback(parseInt(e.target.value, 10) || 1000)}
                className="w-full rounded-xl border border-slate-700 bg-slate-950/60 p-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1 font-medium">终端字号 (Font Size: {fontSize}px)</label>
            <input
              type="range"
              min={10}
              max={24}
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value, 10))}
              className="w-full accent-cyan-500 cursor-pointer"
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
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2 font-semibold text-white shadow-lg shadow-cyan-500/25 hover:from-cyan-400 hover:to-blue-500"
            >
              保存会话配置
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
