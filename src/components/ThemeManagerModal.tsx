import React from 'react';
import { X, Palette, Check } from 'lucide-react';
import { TERMINAL_THEMES } from '../core/terminal/engine';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentTheme: string;
  onSelectTheme: (themeName: string) => void;
}

export const ThemeManagerModal: React.FC<Props> = ({
  isOpen,
  onClose,
  currentTheme,
  onSelectTheme,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-cyan-500/30 bg-slate-900/90 shadow-2xl shadow-cyan-500/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Palette className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-100 text-lg">终端主题与 ANSI 调色盘</h3>
              <p className="text-xs text-slate-400">选择或切换预设的高对比度深色高质感终端主题</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Themes Grid */}
        <div className="p-6 grid grid-cols-2 gap-4">
          {Object.entries(TERMINAL_THEMES).map(([name, t]) => {
            const isSelected = name === currentTheme;
            return (
              <div
                key={name}
                onClick={() => {
                  onSelectTheme(name);
                  onClose();
                }}
                className={`group cursor-pointer rounded-xl border p-3 transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800 bg-slate-950/60 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-xs font-semibold text-slate-200 capitalize">
                    {name}
                  </span>
                  {isSelected && <Check className="h-4 w-4 text-cyan-400" />}
                </div>

                {/* Color swatches */}
                <div className="flex items-center gap-1.5 p-2 rounded-lg bg-slate-950 border border-slate-800">
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.background }} title="Background" />
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.foreground }} title="Foreground" />
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.red }} title="Red" />
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.green }} title="Green" />
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.yellow }} title="Yellow" />
                  <div className="h-4 w-4 rounded" style={{ backgroundColor: t?.blue }} title="Blue" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
