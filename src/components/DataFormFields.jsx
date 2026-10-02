import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { fmtMoney } from '../lib/payroll.js';
import { isDynamicTable, isLedgerTable, rowGroups, resolvePlaceholder, MONTH_TH, tableShapeMismatch, tableRows, tableColumnTotals, isBlank } from '../lib/dataForms.js';

// ============ ช่องกรอกของแบบฟอร์มข้อมูล (ใช้ร่วมกันหน้า "ส่งข้อมูล" และหน้าคอม) ============
const inputCls = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100 disabled:text-stone-500';
const cellCls = 'w-full min-w-[7rem] px-2 py-1.5 border border-stone-200 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-50';
// ค่าของเดือนก่อนไว้ดูเทียบ — จัดรูปเงินเฉพาะช่องตัวเลข (ข้อความอย่างเลขมิเตอร์/เบอร์โทรไม่ใช่เงิน)
const prevHint = (v, type) => (isBlank(v) ? '' : `เดือนก่อน ${type === 'number' ? fmtMoney(v) : String(v)}`);

// period = { year, month } ของงวดที่กำลังกรอก · ledgerView: 'year' (ตารางทั้งปีแบบ Excel) | 'month' (รายการเป็นแถว)
// yearAnswers/yearStatus = ค่าของเดือนอื่นในปีเดียวกัน (สำหรับ ledger) { [month]: tableValue } / { [month]: 'submitted'|'draft' }
function FieldInput({ field, value, onChange, prevValue, disabled, period, ledgerView = 'month', yearAnswers, yearStatus, onPickMonth, onChangeMonth }) {
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
    const ledger = isLedgerTable(field) && ledgerView === 'year' && period;
    return (
      <div>
        {label}
        {ledger
          ? <LedgerYearTable field={field} year={period.year} month={period.month} value={value} onChange={onChange} onChangeMonth={onChangeMonth} yearAnswers={yearAnswers} yearStatus={yearStatus} disabled={disabled} onPickMonth={onPickMonth} />
          : <TableInput field={field} value={value} onChange={onChange} prevValue={prevValue} disabled={disabled} period={period} />}
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

// เซลล์กรอกของตาราง (ใช้ทั้งแบบรายการเป็นแถว และแบบทั้งปี)
function CellInput({ col, value, onChange, placeholder, title, disabled, compact }) {
  const base = compact ? 'w-full min-w-[6.5rem] px-2 py-1 border border-stone-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-50' : cellCls;
  if (col.type === 'number') return <input type="number" inputMode="decimal" step="0.01" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder || '0'} title={title} className={`${base} text-right`} />;
  return <input type="text" value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} placeholder={placeholder || ''} title={title} className={`${base} text-left`} />;
}

// ตาราง "รายการเป็นแถว": แถวคงที่ (field.rows — มีหัวกลุ่มถ้าตั้ง group) หรือเพิ่มแถวเอง (rows ว่าง → value เป็น array)
function TableInput({ field, value, onChange, prevValue, disabled, period }) {
  const dynamic = isDynamicTable(field);
  const cols = field.columns || [];
  const rows = tableRows(field, value);
  const prevRows = tableRows(field, prevValue);
  const prevCell = (rowKey, colKey) => prevRows.find((r) => r.key === rowKey)?.cells?.[colKey];
  const totals = tableColumnTotals(field, value);
  const hasNumber = cols.some((c) => c.type === 'number');
  const grouped = !dynamic && rowGroups(field).some(Boolean);

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
  let lastGroup = null;
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
          {rows.map((r, i) => {
            const groupHead = grouped && r.group !== lastGroup ? (lastGroup = r.group) : null;
            return (
              <React.Fragment key={r.key}>
                {groupHead != null && <tr className="bg-emerald-50/60"><td colSpan={cols.length + 1} className="px-3 py-1 text-xs font-semibold text-emerald-900">{groupHead || 'อื่นๆ'}</td></tr>}
                <tr>
                  {!dynamic && <td className="px-3 py-1.5 text-stone-700 whitespace-nowrap" title={r.hint || ''}>{r.label}{r.sub && <span className="block text-[11px] text-stone-400 font-normal">{r.sub}</span>}</td>}
                  {cols.map((c) => {
                    const pv = dynamic ? undefined : prevCell(r.key, c.key);
                    // ช่องข้อความที่ตั้งค่าจางไว้ (เช่น รอบเดือน = {month}) ใช้ค่าจางนั้น ไม่เอาข้อความเดือนก่อนมาโชว์ให้สับสน
                    const ph = c.type === 'number' ? (isBlank(pv) ? '0' : String(pv)) : (c.placeholder ? resolvePlaceholder(c.placeholder, period) : (isBlank(pv) ? '' : String(pv)));
                    return (
                      <td key={c.key} className="px-1.5 py-1">
                        <CellInput col={c} value={r.cells[c.key]} onChange={(v) => setCell(r.key, c.key, v)} disabled={disabled} placeholder={ph} title={isBlank(pv) ? '' : `เดือนก่อน ${c.type === 'number' ? fmtMoney(pv) : pv}`} />
                      </td>
                    );
                  })}
                  {dynamic && !disabled && <td className="px-1"><button type="button" onClick={() => rmRow(i)} className="p-1 text-stone-400 hover:text-red-500 hover:bg-red-50 rounded" title="ลบแถว"><Trash2 className="w-3.5 h-3.5" /></button></td>}
                </tr>
              </React.Fragment>
            );
          })}
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

// ตาราง "ทั้งปี" แบบ Excel ของผู้จัดการ: เดือนเป็นแถว · รายการ (บัญชี) เป็นคอลัมน์ (มีหัวกลุ่ม ค่าไฟ/ค่าน้ำ/…) · แต่ละรายการมีคอลัมน์ย่อยตาม field.columns
// **ทุกเดือนกรอกได้** (บิลมาช้า/เร็ว รอบบิลไม่ตรงเดือน ผู้จัดการหยอดลงเดือนที่บิลมา) — เดือนที่เลือกไฮไลต์ (สถานะ/ปุ่มส่งเป็นของเดือนนั้น)
// เดือนอื่นแก้ผ่าน onChangeMonth(m, value) → หน้าเก็บเป็นร่างของเดือนนั้นแล้วบันทึกพร้อมกัน · กดชื่อเดือนเพื่อย้ายเดือนที่เลือก
function LedgerYearTable({ field, year, month, value, onChange, onChangeMonth, yearAnswers = {}, yearStatus = {}, disabled, onPickMonth }) {
  const cols = field.columns || [];
  const items = field.rows || [];
  const groups = rowGroups(field);
  const asObj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const valueOf = (m) => asObj(m === month ? value : yearAnswers[m]);
  const setCell = (m, rowKey, colKey, v) => {
    const curV = valueOf(m);
    const next = { ...curV, [rowKey]: { ...(curV[rowKey] || {}), [colKey]: v } };
    if (m === month) onChange(next); else onChangeMonth?.(m, next);
  };
  const numCols = cols.filter((c) => c.type === 'number');
  // ยอดรวมทั้งปีต่อรายการ (ใช้ค่าสดที่กำลังพิมพ์)
  const yearTotal = (rowKey, colKey) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].reduce((s, m) => s + (Number(valueOf(m)?.[rowKey]?.[colKey]) || 0), 0);
  if (!cols.length || !items.length) return <p className="text-xs text-stone-400">ตารางนี้ยังไม่ได้กำหนดคอลัมน์/รายการ — แจ้งเจ้าของระบบ</p>;
  const stickyCls = 'sticky left-0 z-10 bg-white';
  return (
    <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
      <table className="text-sm border-collapse">
        <thead className="text-xs">
          {groups.some(Boolean) && (
            <tr className="bg-emerald-50 text-emerald-900">
              <th className={`${stickyCls} bg-emerald-50 px-3 py-1.5 text-left font-semibold border-r border-stone-200`}>พ.ศ. {year + 543}</th>
              {groups.map((g) => <th key={g || '_'} colSpan={items.filter((r) => (r.group || '') === g).length * cols.length} className="px-2 py-1.5 font-semibold border-l border-stone-200">{g || ''}</th>)}
            </tr>
          )}
          <tr className="bg-stone-50 text-stone-700">
            <th className={`${stickyCls} bg-stone-50 px-3 py-1.5 text-left font-medium border-r border-stone-200`}>{groups.some(Boolean) ? 'รายการ' : `พ.ศ. ${year + 543}`}</th>
            {items.map((r) => (
              <th key={r.key} colSpan={cols.length} title={r.hint || ''} className="px-2 py-1.5 font-semibold border-l border-stone-200 whitespace-nowrap align-top">
                {r.label}{r.sub && <span className="block text-[11px] text-stone-500 font-normal max-w-[14rem] whitespace-normal">{r.sub}</span>}
              </th>
            ))}
          </tr>
          <tr className="bg-stone-50 text-stone-500">
            <th className={`${stickyCls} bg-stone-50 px-3 py-1 text-left font-normal border-r border-stone-200`}>เดือน</th>
            {items.map((r) => cols.map((c, ci) => <th key={`${r.key}.${c.key}`} className={`px-2 py-1 font-normal whitespace-nowrap ${ci === 0 ? 'border-l border-stone-200' : ''} ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>))}
          </tr>
        </thead>
        <tbody>
          {MONTH_TH.map((mName, i) => {
            const m = i + 1;
            const active = m === month;
            const st = yearStatus[m];
            const v = valueOf(m);
            return (
              <tr key={m} className={`border-t border-stone-100 ${active ? 'bg-amber-50' : ''}`}>
                <td className={`${stickyCls} ${active ? 'bg-amber-50' : ''} px-3 py-1 border-r border-stone-200 whitespace-nowrap`}>
                  <button type="button" onClick={() => !active && onPickMonth?.(m)} disabled={active || !onPickMonth} className={`text-left ${active ? 'font-semibold text-amber-900' : 'text-stone-700 hover:underline'}`} title={active ? '' : 'กดเพื่อเลือกเดือนนี้ (ดูสถานะ/ส่งข้อมูลของเดือนนั้น)'}>
                    {mName}{active && <span className="text-[10px] font-normal ml-1">← เดือนที่เลือก</span>}
                  </button>
                  {st && <span className={`ml-1.5 text-[10px] ${st === 'submitted' ? 'text-emerald-700' : 'text-stone-400'}`}>{st === 'submitted' ? '✓ ส่งแล้ว' : 'ร่าง'}</span>}
                </td>
                {items.map((r) => cols.map((c, ci) => (
                  <td key={`${r.key}.${c.key}`} className={`px-1 py-0.5 ${ci === 0 ? 'border-l border-stone-200' : ''}`}>
                    <CellInput compact col={c} value={v?.[r.key]?.[c.key]} onChange={(val) => setCell(m, r.key, c.key, val)} disabled={disabled} placeholder={c.type === 'number' ? '0' : resolvePlaceholder(c.placeholder, { year, month: m })} />
                  </td>
                )))}
              </tr>
            );
          })}
        </tbody>
        {numCols.length > 0 && (
          <tfoot className="bg-stone-50 text-xs border-t border-stone-200">
            <tr>
              <td className={`${stickyCls} bg-stone-50 px-3 py-1.5 font-medium text-stone-600 border-r border-stone-200`}>รวมทั้งปี</td>
              {items.map((r) => cols.map((c, ci) => <td key={`${r.key}.${c.key}`} className={`px-2 py-1.5 font-semibold whitespace-nowrap ${ci === 0 ? 'border-l border-stone-200' : ''} ${c.type === 'number' ? 'text-right text-emerald-800' : ''}`}>{c.type === 'number' ? fmtMoney(yearTotal(r.key, c.key)) : ''}</td>))}
            </tr>
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
          const grouped = !dynamic && rowGroups(f).some(Boolean);
          let lastGroup = null;
          if (!rows.length) return <div key={f.key}><div className="text-xs font-medium text-stone-600">{f.label}</div><div className="text-xs text-stone-400">— ไม่มีข้อมูล —</div></div>;
          return (
            <div key={f.key}>
              <div className="text-xs font-medium text-stone-600 mb-1">{f.label}</div>
              <div className="overflow-x-auto rounded-md border border-stone-200 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-stone-50 text-stone-500"><tr>{!dynamic && <th className="text-left px-2 py-1">รายการ</th>}{cols.map((c) => <th key={c.key} className={`px-2 py-1 whitespace-nowrap ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-stone-100">
                    {rows.map((r) => {
                      const groupHead = grouped && r.group !== lastGroup ? (lastGroup = r.group) : null;
                      return (
                        <React.Fragment key={r.key}>
                          {groupHead != null && <tr className="bg-emerald-50/60"><td colSpan={cols.length + 1} className="px-2 py-0.5 font-semibold text-emerald-900">{groupHead || 'อื่นๆ'}</td></tr>}
                          <tr>{!dynamic && <td className="px-2 py-1 text-stone-700 whitespace-nowrap">{r.label}{r.sub && <span className="text-stone-400"> · {r.sub}</span>}</td>}{cols.map((c) => <td key={c.key} className={`px-2 py-1 ${c.type === 'number' ? 'text-right' : 'text-left'}`}>{c.type === 'number' ? (isBlank(r.cells[c.key]) ? <span className="text-stone-300">—</span> : fmtMoney(r.cells[c.key])) : (r.cells[c.key] ?? '')}</td>)}</tr>
                        </React.Fragment>
                      );
                    })}
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

export { FieldInput, TableInput, LedgerYearTable, AnswersView };
