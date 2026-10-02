import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fmtMoney } from '../lib/payroll.js';
import { isDynamicTable, tableShapeMismatch, tableRows, tableColumnTotals, isBlank } from '../lib/dataForms.js';

// ============ ช่องกรอกของแบบฟอร์มข้อมูล (ใช้ร่วมกันหน้า "ส่งข้อมูล" และหน้าคอม) ============
const inputCls = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100 disabled:text-stone-500';
const cellCls = 'w-full min-w-[7rem] px-2 py-1.5 border border-stone-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-50';
// ค่าของเดือนก่อนไว้ดูเทียบ — จัดรูปเงินเฉพาะช่องตัวเลข (ข้อความอย่างเลขมิเตอร์/เบอร์โทรไม่ใช่เงิน)
const prevHint = (v, type) => (isBlank(v) ? '' : `เดือนก่อน ${type === 'number' ? fmtMoney(v) : String(v)}`);

function FieldInput({ field, value, onChange, prevValue, disabled }) {
  const id = `df_${field.key}`;
  const label = (
    <label htmlFor={id} className="block text-sm font-medium text-stone-700 mb-1">
      {field.label || field.key}{field.required && <span className="text-red-500"> *</span>}
      {field.unit && <span className="text-xs font-normal text-stone-400"> ({field.unit})</span>}
    </label>
  );
  const ph = field.type !== 'table' ? prevHint(prevValue, field.type) : '';
  const hint = (field.hint || ph) ? (
    <p className="text-xs text-stone-400 mt-1">{field.hint}{field.hint && ph ? ' · ' : ''}{ph}</p>
  ) : null;

  if (field.type === 'table') {
    return (
      <div>
        {label}
        <TableInput field={field} value={value} onChange={onChange} prevValue={prevValue} disabled={disabled} />
        {field.hint && <p className="text-xs text-stone-400 mt-1">{field.hint}</p>}
      </div>
    );
  }
  if (field.type === 'textarea') {
    return <div>{label}<textarea id={id} rows={3} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={`${inputCls} resize-y`} />{hint}</div>;
  }
  if (field.type === 'number') {
    return <div>{label}<input id={id} type="number" inputMode="decimal" step="0.01" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={isBlank(prevValue) ? '0' : String(prevValue)} className={`${inputCls} text-right`} />{hint}</div>;
  }
  if (field.type === 'date') {
    return <div>{label}<input id={id} type="date" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls} />{hint}</div>;
  }
  return <div>{label}<input id={id} type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={isBlank(prevValue) ? '' : String(prevValue)} className={inputCls} />{hint}</div>;
}

// ตาราง: แถวคงที่ (field.rows) หรือเพิ่มแถวเอง (rows ว่าง → value เป็น array)
function TableInput({ field, value, onChange, prevValue, disabled }) {
  const dynamic = isDynamicTable(field);
  const cols = field.columns || [];
  const rows = tableRows(field, value);
  const prevRows = tableRows(field, prevValue);
  const prevCell = (rowKey, colKey) => prevRows.find((r) => r.key === rowKey)?.cells?.[colKey];
  const totals = tableColumnTotals(field, value);
  const hasNumber = cols.some((c) => c.type === 'number');

  const setCell = (rowKey, colKey, v) => {
    if (dynamic) {
      const arr = Array.isArray(value) ? [...value] : [];
      const i = Number(rowKey);
      arr[i] = { ...(arr[i] || {}), [colKey]: v };
      onChange(arr);
    } else {
      const obj = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      onChange({ ...obj, [rowKey]: { ...(obj[rowKey] || {}), [colKey]: v } });
    }
  };
  const addRow = () => onChange([...(Array.isArray(value) ? value : []), {}]);
  const rmRow = (i) => onChange((Array.isArray(value) ? value : []).filter((_, idx) => idx !== i));

  if (!cols.length) return <p className="text-xs text-stone-400">ตารางนี้ยังไม่ได้กำหนดคอลัมน์ — แจ้งเจ้าของระบบ</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      {tableShapeMismatch(field, value) && <p className="text-xs text-amber-700 bg-amber-50 px-3 py-1.5 border-b border-amber-100">รูปแบบตารางถูกเปลี่ยนหลังจากกรอกไว้ — ข้อมูลเดิมของช่องนี้แสดงไม่ได้ กรอกใหม่ตามตารางปัจจุบัน</p>}
      <table className="w-full text-sm">
        <thead className="bg-stone-50 text-stone-500 text-xs">
          <tr>
            {!dynamic && <th className="text-left px-3 py-2 whitespace-nowrap">รายการ</th>}
            {cols.map((c) => <th key={c.key} className={`px-2 py-2 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label || c.key}</th>)}
            {dynamic && !disabled && <th className="w-8" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {rows.length === 0 && dynamic && (
            <tr><td colSpan={cols.length + 1} className="px-3 py-3 text-xs text-stone-400 text-center">ยังไม่มีแถว — กด "เพิ่มแถว"</td></tr>
          )}
          {rows.map((r, i) => (
            <tr key={r.key}>
              {!dynamic && <td className="px-3 py-1.5 text-stone-700 whitespace-nowrap">{r.label}</td>}
              {cols.map((c) => {
                const pv = dynamic ? undefined : prevCell(r.key, c.key);
                return (
                  <td key={c.key} className="px-1.5 py-1">
                    {c.type === 'number'
                      ? <input type="number" inputMode="decimal" step="0.01" value={r.cells[c.key] ?? ''} onChange={(e) => setCell(r.key, c.key, e.target.value)} disabled={disabled} placeholder={isBlank(pv) ? '0' : String(pv)} title={isBlank(pv) ? '' : `เดือนก่อน ${fmtMoney(pv)}`} className={cellCls} />
                      : <input type="text" value={r.cells[c.key] ?? ''} onChange={(e) => setCell(r.key, c.key, e.target.value)} disabled={disabled} placeholder={isBlank(pv) ? '' : String(pv)} className={`${cellCls} text-left`} />}
                  </td>
                );
              })}
              {dynamic && !disabled && <td className="px-1"><button type="button" onClick={() => rmRow(i)} className="p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded" title="ลบแถว"><Trash2 className="w-3.5 h-3.5" /></button></td>}
            </tr>
          ))}
        </tbody>
        {(hasNumber || (dynamic && !disabled)) && (
          <tfoot className="bg-stone-50 text-xs">
            {hasNumber && (
              <tr>
                {!dynamic && <td className="px-3 py-1.5 font-medium text-stone-600">รวม</td>}
                {cols.map((c, ci) => (
                  <td key={c.key} className={`px-2 py-1.5 font-semibold ${c.type === 'number' ? 'text-right text-emerald-800' : 'text-left text-stone-500'}`}>
                    {c.type === 'number' ? fmtMoney(totals[c.key] || 0) : (dynamic && ci === 0 ? 'รวม' : '')}
                  </td>
                ))}
                {dynamic && !disabled && <td />}
              </tr>
            )}
            {dynamic && !disabled && (
              <tr><td colSpan={cols.length + 1} className="px-2 py-1.5"><button type="button" onClick={addRow} className="flex items-center gap-1 text-xs text-emerald-700 hover:underline"><Plus className="w-3 h-3" />เพิ่มแถว</button></td></tr>
            )}
          </tfoot>
        )}
      </table>
    </div>
  );
}

// แสดงคำตอบแบบอ่านอย่างเดียว (ย่อ) — ใช้ในหน้าคอมดูว่าผู้จัดการส่งอะไรมา
function AnswersView({ fields, answers }) {
  const a = answers && typeof answers === 'object' ? answers : {};
  return (
    <div className="space-y-3">
      {(fields || []).map((f) => {
        const v = a[f.key];
        if (f.type === 'table') {
          const cols = f.columns || [];
          const rows = tableRows(f, v);
          const totals = tableColumnTotals(f, v);
          const dynamic = isDynamicTable(f);
          if (!rows.length) return <div key={f.key}><div className="text-xs font-medium text-stone-600">{f.label}</div><div className="text-xs text-stone-400">— ไม่มีข้อมูล —</div></div>;
          return (
            <div key={f.key}>
              <div className="text-xs font-medium text-stone-600 mb-1">{f.label}</div>
              <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500"><tr>{!dynamic && <th className="text-left px-2 py-1">รายการ</th>}{cols.map((c) => <th key={c.key} className={`px-2 py-1 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((r) => (
                      <tr key={r.key}>{!dynamic && <td className="px-2 py-1 text-stone-700 whitespace-nowrap">{r.label}</td>}{cols.map((c) => <td key={c.key} className={`px-2 py-1 ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.type === 'number' ? (isBlank(r.cells[c.key]) ? <span className="text-stone-300">—</span> : fmtMoney(r.cells[c.key])) : (r.cells[c.key] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                  {cols.some((c) => c.type === 'number') && (
                    <tfoot className="bg-stone-50"><tr>{!dynamic && <td className="px-2 py-1 font-medium">รวม</td>}{cols.map((c) => <td key={c.key} className={`px-2 py-1 font-semibold ${c.type === 'number' ? 'text-right text-emerald-800' : ''}`}>{c.type === 'number' ? fmtMoney(totals[c.key] || 0) : ''}</td>)}</tr></tfoot>
                  )}
                </table>
              </div>
            </div>
          );
        }
        return (
          <div key={f.key} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-stone-600 shrink-0">{f.label}{f.unit ? ` (${f.unit})` : ''}</span>
            <span className={`text-right whitespace-pre-wrap ${f.type === 'number' ? 'font-medium text-stone-800' : 'text-stone-700'}`}>{isBlank(v) ? <span className="text-stone-300">—</span> : (f.type === 'number' ? fmtMoney(v) : String(v))}</span>
          </div>
        );
      })}
    </div>
  );
}

export { FieldInput, TableInput, AnswersView };
