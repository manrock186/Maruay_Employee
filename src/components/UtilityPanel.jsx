import React, { useState, useMemo } from 'react';
import { Zap, Settings2, AlertTriangle, TrendingDown, TrendingUp } from 'lucide-react';
import { fmtMoney } from '../lib/payroll.js';
import { periodLabel, periodKey } from '../lib/dataForms.js';
import { UTILITY_MODES, refOf, utilityCandidates } from '../lib/utility.js';
import { groupTone } from './DataFormFields.jsx';
import { Modal } from '../ui/index.jsx';

// ============ กล่อง "สาธารณูปโภค" ในหน้าคอม: รายจ่าย (บิลที่เลือก) vs รายรับจากผู้เช่า → กำไร/ขาดทุน → รายการหักอัตโนมัติ ============
// result = computeUtility(...) · usedSources: `${srcKey}@YYYY-MM` -> [{year, month}] งวดคอมอื่นที่เคยใช้ยอดเดียวกันแล้ว
function UtilityPanel({ config, result, forms, usedSources = {}, period, onSaveConfig, disabled }) {
  const [editing, setEditing] = useState(false);
  const usedOf = (x) => (x.has ? usedSources[`${x.srcKey}@${periodKey(x.period)}`] : null);
  const tag = (x) => {
    if (!x.has) return <span className="text-[10px] px-1 rounded bg-stone-100 text-stone-500">ยังไม่มียอด</span>;
    const other = x.period.year !== period.year || x.period.month !== period.month;
    const draft = x.status !== 'submitted';
    return (other || draft) ? <span className={`text-[10px] px-1 rounded ${draft ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{periodLabel(x.period)}{draft ? ' ร่าง' : ''}</span> : null;
  };
  const Row = ({ x, income }) => {
    const used = usedOf(x);
    return (
      <div className={`flex items-center gap-2 text-xs py-1 border-b border-stone-100 last:border-0 ${used ? 'bg-rose-50 -mx-2 px-2 rounded' : ''}`} title={used ? `ยอดนี้เคยใช้คิดคอมงวด ${used.map(periodLabel).join(', ')} แล้ว` : ''}>
        {x.group && !income && <span className={`shrink-0 w-1.5 h-4 rounded-full ${groupTone(x.group).dot}`} />}
        <span className="flex-1 min-w-0 truncate text-stone-700">{x.label}{x.sub && <span className="text-stone-400"> · {x.sub}</span>}</span>
        {used && <span className="text-[10px] px-1 rounded bg-rose-100 text-rose-800 flex items-center gap-0.5"><AlertTriangle className="w-3 h-3" />ใช้แล้ว {used.map(periodLabel).join(', ')}</span>}
        {tag(x)}
        {income && x.divisor !== 1 && <span className="text-[10px] text-stone-500 tabular-nums">{fmtMoney(x.raw)} ÷ {x.divisor}</span>}
        <span className={`w-24 text-right tabular-nums font-medium ${x.has ? 'text-stone-800' : 'text-stone-300'}`}>{fmtMoney(x.value)}</span>
      </div>
    );
  };
  const usedCount = [...result.expense, ...result.income].filter((x) => usedOf(x)).length;
  const loss = result.net < 0;
  const modeLabel = UTILITY_MODES.find((m) => m.value === result.mode)?.label;

  return (
    <div className="rounded-lg border border-yellow-200 bg-yellow-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm font-medium text-stone-800"><Zap className="w-4 h-4 text-yellow-600" />สาธารณูปโภค (น้ำ-ไฟ-เน็ต-โทร) — รายจ่าย เทียบ รายรับจากผู้เช่า</div>
        <button type="button" onClick={() => setEditing(true)} disabled={disabled} className="text-xs px-2 py-1 bg-white hover:bg-stone-50 border border-stone-200 rounded-md text-stone-600 flex items-center gap-1 disabled:opacity-50"><Settings2 className="w-3.5 h-3.5" />เลือกรายการ / วิธีหัก</button>
      </div>
      {!config?.enabled ? (
        <p className="text-xs text-stone-500">ยังไม่เปิดใช้ — กด "เลือกรายการ / วิธีหัก" เพื่อเลือกบิลที่เป็นรายจ่าย และรายรับจากผู้เช่า</p>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="bg-white rounded-md border border-stone-200 p-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-rose-800 mb-1"><span>รายจ่าย — บิลที่จ่าย ({result.expense.length} บัญชี)</span><span className="tabular-nums">{fmtMoney(result.expenseTotal)}</span></div>
              {result.expense.length ? result.expense.map((x) => <Row key={x.ref} x={x} />) : <p className="text-xs text-stone-400">ยังไม่ได้เลือก</p>}
            </div>
            <div className="bg-white rounded-md border border-stone-200 p-2.5">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-800 mb-1"><span>รายรับ — เก็บจากผู้เช่า ({result.income.length} รายการ)</span><span className="tabular-nums">{fmtMoney(result.incomeTotal)}</span></div>
              {result.income.length ? result.income.map((x) => <Row key={x.ref} x={x} income />) : <p className="text-xs text-stone-400">ยังไม่ได้เลือก</p>}
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-md px-3 py-2 ${loss ? 'bg-rose-100 text-rose-900' : 'bg-emerald-100 text-emerald-900'}`}>
            <span className="flex items-center gap-1.5 text-sm font-medium">{loss ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}{loss ? 'สาธารณูปโภค ขาดทุน' : 'สาธารณูปโภค กำไร'} <span className="text-xs font-normal opacity-80">(รายรับ {fmtMoney(result.incomeTotal)} − รายจ่าย {fmtMoney(result.expenseTotal)})</span></span>
            <span className="text-lg font-semibold tabular-nums">{fmtMoney(Math.abs(result.net))} ฿</span>
          </div>
          <div className="text-xs text-stone-600 space-y-0.5">
            <div>วิธีหักกองกลาง: <b>{modeLabel}</b></div>
            {result.deductions.map((d) => <div key={d.auto} className="flex justify-between"><span>→ {d.label}</span><span className="tabular-nums font-medium">{d.amount < 0 ? `+${fmtMoney(-d.amount)}` : `−${fmtMoney(d.amount)}`}</span></div>)}
            {(result.missingExpense > 0 || result.missingIncome > 0) && <div className="text-amber-700">⚠ ยังไม่มียอด: บิล {result.missingExpense} บัญชี · รายรับ {result.missingIncome} รายการ (นับเป็น 0)</div>}
            {usedCount > 0 && <div className="text-rose-700 font-medium">⚠ {usedCount} ยอดเคยใช้คิดคอมงวดก่อนแล้ว (แถวสีแดง) — บิลเดือนใหม่อาจยังไม่มา ระวังหักซ้ำ</div>}
            <div className="text-stone-400">ใช้ยอดล่าสุดที่มีของแต่ละช่อง (ไม่เกินเดือนถัดจากงวด) · ป้ายฟ้า = ยอดมาจากเดือนอื่น · รายการหักชุดนี้คำนวณให้อัตโนมัติ แก้มือไม่ได้</div>
          </div>
        </>
      )}
      {editing && <UtilitySettingsModal config={config} forms={forms} onClose={() => setEditing(false)} onSave={async (c) => { const ok = await onSaveConfig(c); if (ok) setEditing(false); }} />}
    </div>
  );
}

// ---- โมดัลเลือกรายการ: ติ๊กบิลที่เป็นรายจ่าย / รายรับจากผู้เช่า (+ ตัวหาร) / วิธีหัก ----
function UtilitySettingsModal({ config, forms, onClose, onSave }) {
  const cands = useMemo(() => utilityCandidates(forms), [forms]);
  const [enabled, setEnabled] = useState(config?.enabled !== false);
  const [mode, setMode] = useState(config?.mode || 'excel');
  const [exp, setExp] = useState(() => new Set((config?.expense || []).map(refOf)));
  const [inc, setInc] = useState(() => { const m = new Map(); (config?.income || []).forEach((x) => m.set(refOf(x), Number(x.divisor) > 0 ? Number(x.divisor) : 1)); return m; });
  const [saving, setSaving] = useState(false);
  const toggle = (set, ref) => { const n = new Set(set); if (n.has(ref)) n.delete(ref); else n.add(ref); return n; };
  const byForm = useMemo(() => { const m = new Map(); cands.forEach((c) => { if (!m.has(c.formId)) m.set(c.formId, { name: c.formName, items: [] }); m.get(c.formId).items.push(c); }); return [...m.values()]; }, [cands]);
  const pick = (c) => ({ formId: c.formId, fieldKey: c.fieldKey, rowKey: c.rowKey, colKey: c.colKey });
  const save = async () => {
    setSaving(true);
    await onSave({
      enabled, mode,
      expense: cands.filter((c) => exp.has(c.ref)).map(pick),
      income: cands.filter((c) => inc.has(c.ref)).map((c) => ({ ...pick(c), divisor: inc.get(c.ref) || 1 })),
    });
    setSaving(false);
  };
  // เรียกเป็นฟังก์ชัน ไม่ใช่ <List/> — component ที่สร้างใหม่ทุก render ทำให้ช่องตัวหารหลุดโฟกัสตอนพิมพ์
  const renderList = (kind) => (
    <div className="space-y-3">
      {byForm.map((g) => (
        <div key={g.name}>
          <div className="text-[11px] font-semibold text-stone-500 mb-1">{g.name}</div>
          <div className="space-y-0.5">
            {g.items.map((c) => {
              const on = kind === 'exp' ? exp.has(c.ref) : inc.has(c.ref);
              return (
                <label key={c.ref} className={`flex items-center gap-2 text-xs px-2 py-1 rounded cursor-pointer ${on ? (kind === 'exp' ? 'bg-rose-50' : 'bg-emerald-50') : 'hover:bg-stone-50'}`}>
                  <input type="checkbox" checked={on} onChange={() => (kind === 'exp' ? setExp((s) => toggle(s, c.ref)) : setInc((m) => { const n = new Map(m); if (n.has(c.ref)) n.delete(c.ref); else n.set(c.ref, 1); return n; }))} className={kind === 'exp' ? 'accent-rose-600' : 'accent-emerald-700'} />
                  {c.ledger && <span className={`shrink-0 w-1.5 h-4 rounded-full ${groupTone(c.group).dot}`} />}
                  <span className="flex-1 min-w-0 truncate">{!c.ledger && c.group && c.group !== c.label ? `${c.group} — ` : ''}{c.label}{c.sub && <span className="text-stone-400"> · {c.sub}</span>}</span>
                  {kind === 'inc' && on && (
                    <span className="flex items-center gap-1 text-stone-500" onClick={(e) => e.preventDefault()}>÷
                      <input type="text" inputMode="decimal" value={inc.get(c.ref)} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setInc((m) => new Map(m).set(c.ref, v)); }} className="w-12 px-1 py-0.5 border border-stone-300 rounded text-right" title="ตัวหาร เช่น ส่วนกลาง ÷ 1.5 (ตาม Excel เดิม) · 1 = ใช้เต็มจำนวน" />
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      ))}
      {!byForm.length && <p className="text-xs text-stone-400">ยังไม่มีแบบฟอร์มที่มีช่องตัวเลข</p>}
    </div>
  );
  return (
    <Modal title="สาธารณูปโภค — เลือกรายการที่ใช้คิดคอม" onClose={onClose} wide>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-emerald-700" />เปิดใช้ (คำนวณและหักกองกลางให้อัตโนมัติทุกเดือน)</label>
        <div>
          <div className="text-xs font-medium text-stone-600 mb-1">วิธีหักกองกลาง</div>
          <div className="space-y-1">
            {UTILITY_MODES.map((m) => <label key={m.value} className="flex items-center gap-2 text-sm"><input type="radio" name="umode" checked={mode === m.value} onChange={() => setMode(m.value)} className="accent-emerald-700" />{m.label}</label>)}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div><div className="text-sm font-semibold text-rose-800 mb-2">รายจ่าย — บิลที่ติ๊ก ({exp.size})</div>{renderList('exp')}</div>
          <div><div className="text-sm font-semibold text-emerald-800 mb-2">รายรับจากผู้เช่า ({inc.size})</div>{renderList('inc')}</div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">ยกเลิก</button>
          <button type="button" onClick={save} disabled={saving} className="px-4 py-2 text-sm bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึก (ใช้ทุกเดือน)'}</button>
        </div>
      </div>
    </Modal>
  );
}

export { UtilityPanel };
