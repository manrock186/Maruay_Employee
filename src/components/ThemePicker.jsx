import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { THEMES } from '../lib/format.js';

// ============ THEME PICKER ============
function ThemePicker({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const cur = THEMES.find((t) => t.value === current) || THEMES[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
        <div className="flex -space-x-1">
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.primary }} />
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.accent }} />
        </div>
        <span className="flex-1 text-left">ธีม: {cur.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden p-1.5">
          <div className="px-2 py-1.5 text-xs font-medium text-stone-400">เลือกธีมสี</div>
          {THEMES.map((t) => {
            const active = t.value === current;
            return (
              <button key={t.value} onClick={() => { onSelect(t.value); setOpen(false); }} className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${active ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                <div className="flex -space-x-1 flex-shrink-0">
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.primary }} />
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800">{t.label}</div>
                  <div className="text-[11px] text-stone-500">{t.desc}</div>
                </div>
                {active && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export {
  ThemePicker,
};
