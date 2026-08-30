import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Banknote, Check } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney } from '../lib/payroll.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ ADVANCE PAGE (เบิกเงินระหว่างเดือน) ============
function AdvancePage({ businesses, employees, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  const business = businesses.find((b) => b.id === activeBusinessId);
  const bizEmployees = useMemo(() => employees.filter((e) => isActive(e) && (e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))), [employees, activeBusinessId]);
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? dispName(e) : '— ไม่พบ —'; };
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const newEntry = () => ({ id: `a${Date.now()}${Math.floor(Math.random() * 1000)}`, empId: '', amount: '', date: todayISO(), note: '' });

  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    (async () => {
      const pool = await ops.advance.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      if (pool) {
        setEntries((pool.entries || []).map((e) => ({ ...newEntry(), ...e, amount: e.amount ?? '', date: e.date || '', note: e.note || '' })));
        setNote(pool.note || ''); setSavedAt(pool.updatedAt || pool.createdAt || null);
      } else { setEntries([]); setNote(''); setSavedAt(null); }
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  const addEntry = () => setEntries((es) => [...es, newEntry()]);
  const setEntry = (id, patch) => setEntries((es) => es.map((e) => e.id === id ? { ...e, ...patch } : e));
  const rmEntry = (id) => setEntries((es) => es.filter((e) => e.id !== id));

  const perEmp = useMemo(() => {
    const m = {};
    entries.forEach((e) => { if (!e.empId) return; const v = Number(e.amount) || 0; if (!v) return; m[e.empId] = (m[e.empId] || 0) + v; });
    return m;
  }, [entries]);
  const grandTotal = Object.values(perEmp).reduce((s, v) => s + v, 0);

  const save = async () => {
    setSaving(true);
    const clean = entries
      .filter((e) => e.empId && Number(e.amount))
      .map((e) => ({ id: e.id, empId: e.empId, amount: Number(e.amount) || 0, date: e.date || null, note: (e.note || '').trim() || null }));
    const ok = await ops.advance.upsert({ businessId: activeBusinessId, periodYear: year, periodMonth: month, entries: clean, note: note.trim() || null });
    setSaving(false);
    if (ok) { setSavedAt(new Date().toISOString()); alert('บันทึกการเบิกแล้ว — ยอดเบิกรวมของแต่ละคนจะไปขึ้นช่อง "เบิก" ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะคนที่ยังไม่ได้ทำเงินเดือน)'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="เบิกเงิน" /><div className="p-4 md:p-8"><EmptyState icon={Banknote} title="เลือกธุรกิจที่ sidebar" description="การเบิกเงินแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="เบิกเงิน" subtitle={`${business?.name || ''} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (หักใน ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกการเบิก'}</button>
      </PageHeader>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {savedAt && <span className="text-xs text-emerald-700">บันทึกแล้ว</span>}
        </div>

        <p className="text-sm text-stone-500">บันทึกการเบิกเงินระหว่างเดือนของพนักงาน (ใครเบิกเท่าไหร่ วันไหน) — ยอดเบิกรวมของแต่ละคนจะไปหักในช่อง "เบิก" ของเงินเดือนงวดนี้อัตโนมัติ</p>

        {entries.length === 0 && (
          <EmptyState icon={Banknote} title="ยังไม่มีรายการเบิก" description="กดเพิ่มรายการ แล้วเลือกพนักงาน + จำนวนเงิน + วันที่" action={<button onClick={addEntry} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มรายการแรก</button>} />
        )}

        {entries.length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-stone-500 text-xs">
                  <tr>
                    <th className="text-left px-3 py-2.5 min-w-[160px]">พนักงาน</th>
                    <th className="text-left px-3 py-2.5 w-40">วันที่เบิก</th>
                    <th className="text-right px-3 py-2.5 w-32 min-w-[96px]">จำนวนเงิน</th>
                    <th className="text-left px-3 py-2.5">หมายเหตุ</th>
                    <th className="px-2 py-2.5 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-t border-stone-100">
                      <td className="px-3 py-2">
                        <select value={e.empId} onChange={(ev) => setEntry(e.id, { empId: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded bg-white">
                          <option value="">— เลือกพนักงาน —</option>
                          {bizEmployees.map((emp) => <option key={emp.id} value={emp.id}>{dispName(emp)}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2"><input type="date" value={e.date || ''} onChange={(ev) => setEntry(e.id, { date: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded" /></td>
                      <td className="px-3 py-2"><input type="number" step="0.01" inputMode="decimal" value={e.amount} onChange={(ev) => setEntry(e.id, { amount: ev.target.value })} onFocus={(ev) => ev.target.select()} placeholder="0" className="w-full min-w-[80px] px-2 py-1.5 text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40" /></td>
                      <td className="px-3 py-2"><input value={e.note} onChange={(ev) => setEntry(e.id, { note: ev.target.value })} placeholder="เช่น เบิกค่าเทอมลูก" className="w-full px-2 py-1.5 border border-stone-200 rounded" /></td>
                      <td className="px-2 py-2 text-center"><button onClick={() => rmEntry(e.id)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {entries.length > 0 && (
          <button onClick={addEntry} className="w-full py-2.5 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />เพิ่มรายการเบิก</button>
        )}

        {Object.keys(perEmp).length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-stone-700">ยอดเบิกรวมที่จะหักในเงินเดือน</div>
              <div className="text-sm font-semibold text-red-600">รวม {fmtMoney(grandTotal)} ฿</div>
            </div>
            <div className="text-xs text-stone-500 space-y-0.5">
              {Object.entries(perEmp).map(([id, amt]) => (
                <div key={id} className="flex justify-between"><span>{empName(id)}</span><span className="text-red-600">−{fmtMoney(amt)} ฿</span></div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">ยอดนี้จะไปขึ้นช่อง "เบิก" ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะคนที่ยังไม่ได้ทำเงินเดือนงวดนี้) — ถ้าทำเงินเดือนไปแล้วให้แก้ที่หน้าเงินเดือนโดยตรง</p>
          </div>
        )}

        <FormField label="หมายเหตุงวดนี้"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg resize-none max-w-2xl" /></FormField>
      </div>
    </div>
  );
}


export {
  AdvancePage,
};
