import React, { useState } from 'react';
import { Radio, Send, X, AlertTriangle } from 'lucide-react';
import { t } from '../core/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onBroadcast: (command: string) => void;
  targetCount: number;
}

export const BroadcastInputBar: React.FC<Props> = ({
  isOpen,
  onClose,
  onBroadcast,
  targetCount,
}) => {
  const [command, setCommand] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;
    onBroadcast(command.trim() + '\r');
    setCommand('');
  };

  return (
    <div className="flex items-center justify-between border-t border-amber-500/30 bg-amber-950/40 px-4 py-2 text-xs backdrop-blur-md animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-2 text-amber-300 shrink-0">
        <Radio className="h-4 w-4 text-amber-400 animate-pulse" />
        <span className="font-semibold">{t('broadcastMode')}</span>
        <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-200">
          广播目标: {targetCount} 会话
        </span>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-1 max-w-xl mx-4 items-center gap-2">
        <input
          type="text"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('broadcastPlaceholder')}
          className="flex-1 rounded-lg border border-amber-500/40 bg-slate-950/80 px-3 py-1.5 text-xs text-amber-100 placeholder-amber-500/60 focus:border-amber-400 focus:outline-none"
        />
        <button
          type="submit"
          className="flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 transition-all"
        >
          <Send className="h-3.5 w-3.5" />
          <span>广播发送</span>
        </button>
      </form>

      <button
        onClick={onClose}
        className="rounded p-1 text-amber-400/70 hover:bg-amber-900/40 hover:text-amber-200"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
