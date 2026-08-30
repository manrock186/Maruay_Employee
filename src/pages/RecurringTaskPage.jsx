import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, X, Check, Sparkles } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney } from '../lib/payroll.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ RECURRING TASK PAGE (งานเสริมประจำ) ============
function RecurringTaskPage({ businesses, employees, activeBusinessId, canSeePay = true, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [tasks, setTasks] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [carried, setCarried] = useState(false);

  const business = businesses.find((b) => b.id === activeBusinessId);
  // งานเสริมประจำของธุรกิจนี้ ดึงพนักงานได้ "ทุกธุรกิจ" — ธุรกิจนี้เป็นคนจ่าย
  const allEmployees = useMemo(() => employees.filter((e) => isActive(e)), [employees]);
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? dispName(e) : '— ไม่พบ —'; };
  const bizNameOf = (id) => { const e = employees.find((x) => x.id === id); return e ? (businesses.find((b) => b.id === e.businessId)?.name || '') : ''; };
  const isOtherBiz = (id) => { const e = employees.find((x) => x.id === id); return !!e && e.businessId !== activeBusinessId && !(e.additionalBusinessIds || []).includes(activeBusinessId); };
  const newTask = () => ({ id: `t${Date.now()}${Math.floor(Math.random() * 1000)}`, name: '', defaultPay: '', headcount: '', assignments: [] });
  const mapTask = (t) => ({ ...newTask(), ...t, assignments: (t.assignments || []).map((a) => ({ empId: a.empId, amount: a.amount ?? '' })) });

  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    setCarried(false);
    (async () => {
      const pool = await ops.recurringTask.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      if (pool) {
        setTasks((pool.tasks || []).map(mapTask));
        setNote(pool.note || ''); setSavedAt(pool.updatedAt || pool.createdAt || null);
        return;
      }
      // เดือนใหม่ยังไม่เคยบันทึก → ดึงงาน + คนเดิมจากเดือนก่อนมาตั้งต้น
      const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      const prevPool = await ops.recurringTask.getByPeriod(activeBusinessId, prev.y, prev.m);
      if (cancelled) return;
      if (prevPool && (prevPool.tasks || []).length) {
        setTasks(prevPool.tasks.map(mapTask));
        setCarried(true);
      } else { setTasks([]); }
      setNote(''); setSavedAt(null);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  const addTask = () => setTasks((ts) => [...ts, newTask()]);
  const setTask = (id, patch) => setTasks((ts) => ts.map((t) => t.id === id ? { ...t, ...patch } : t));
  const rmTask = (id) => setTasks((ts) => ts.filter((t) => t.id !== id));
  const addAssignee = (taskId, empId) => { if (!empId) return; setTasks((ts) => ts.map((t) => t.id === taskId && !t.assignments.some((a) => a.empId === empId) ? { ...t, assignments: [...t.assignments, { empId, amount: '' }] } : t)); };
  const rmAssignee = (taskId, empId) => setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, assignments: t.assignments.filter((a) => a.empId !== empId) } : t));
  const setAssigneeAmount = (taskId, empId, amount) => setTasks((ts) => ts.map((t) => t.id === taskId ? { ...t, assignments: t.assignments.map((a) => a.empId === empId ? { ...a, amount } : a) } : t));

  const effAmount = (t, a) => (a.amount != null && a.amount !== '' ? Number(a.amount) : Number(t.defaultPay) || 0);

  const perEmp = useMemo(() => {
    const m = {};
    tasks.forEach((t) => (t.assignments || []).forEach((a) => { if (!a.empId) return; const v = effAmount(t, a); if (!v) return; m[a.empId] = (m[a.empId] || 0) + v; }));
    return m;
  }, [tasks]);
  const grandTotal = Object.values(perEmp).reduce((s, v) => s + v, 0);

  const save = async () => {
    setSaving(true);
    const clean = tasks
      .filter((t) => (t.name || '').trim() || (t.assignments || []).length)
      .map((t) => ({
        id: t.id, name: (t.name || '').trim(), defaultPay: Number(t.defaultPay) || 0, headcount: Number(t.headcount) || 0,
        assignments: (t.assignments || []).filter((a) => a.empId).map((a) => ({ empId: a.empId, amount: (a.amount === '' || a.amount == null) ? null : (Number(a.amount) || 0) })),
      }));
    const ok = await ops.recurringTask.upsert({ businessId: activeBusinessId, periodYear: year, periodMonth: month, tasks: clean, note: note.trim() || null });
    setSaving(false);
    if (ok) { setSavedAt(new Date().toISOString()); setCarried(false); alert('บันทึกงานเสริมประจำแล้ว — ค่าจ้างจะไปบวกเข้าช่องงานเสริมในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะคนที่ยังไม่ได้ทำเงินเดือน)'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="งานเสริมประจำ" /><div className="p-4 md:p-8"><EmptyState icon={Sparkles} title="เลือกธุรกิจที่ sidebar" description="งานเสริมประจำแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="งานเสริมประจำ" subtitle={`${business?.name || ''} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกงานเสริมประจำ'}</button>
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

        {carried && tasks.length > 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ดึงงานเสริมประจำ + คนเดิมจากเดือนก่อนมาให้แล้ว — ปรับ{canSeePay ? 'คน/ค่าจ้าง' : 'รายชื่อคน'}ให้ตรงเดือนนี้ แล้วกดบันทึก</p>
        )}

        <p className="text-sm text-stone-500">{canSeePay
          ? 'กำหนดงานที่ต้องทำทุกเดือน (เช่น ล้างห้องน้ำ, ทำความสะอาดกลางคืน) ตั้งค่าจ้างต่อคน แล้วดึงพนักงานเข้างาน — ค่าจ้างจะไปบวกเข้า "งานเสริม" ในเงินเดือนของแต่ละคนอัตโนมัติ'
          : 'กำหนดงานที่ต้องทำทุกเดือน (เช่น ล้างห้องน้ำ, ทำความสะอาดกลางคืน) แล้วดึงพนักงานเข้างาน — ค่าจ้างของแต่ละงานจะถูกตั้งโดยผู้ดูแลเงินเดือน'}</p>

        {tasks.length === 0 && (
          <EmptyState icon={Sparkles} title="ยังไม่มีงานเสริมประจำ" description="เพิ่มงาน เช่น ล้างห้องน้ำ / ทำความสะอาดกลางคืน แล้วดึงพนักงานเข้างาน" action={<button onClick={addTask} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มงานแรก</button>} />
        )}

        <div className="space-y-3">
          {tasks.map((t) => {
            const assigned = (t.assignments || []).filter((a) => a.empId);
            const available = allEmployees.filter((e) => !assigned.some((a) => a.empId === e.id));
            const taskTotal = assigned.reduce((s, a) => s + effAmount(t, a), 0);
            const target = Number(t.headcount) || 0;
            return (
              <div key={t.id} className="bg-white border border-stone-200 rounded-xl p-4">
                <div className="flex flex-wrap items-end gap-3 mb-3">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-xs text-stone-500 mb-1">ชื่องาน</label>
                    <input value={t.name} onChange={(e) => setTask(t.id, { name: e.target.value })} placeholder="เช่น ล้างห้องน้ำ" className="w-full px-3 py-2 border border-stone-300 rounded-lg" />
                  </div>
                  {canSeePay && (
                  <div className="w-28">
                    <label className="block text-xs text-stone-500 mb-1">ค่าจ้าง/คน</label>
                    <input type="number" step="0.01" value={t.defaultPay} onChange={(e) => setTask(t.id, { defaultPay: e.target.value })} placeholder="0" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-right" />
                  </div>
                  )}
                  <div className="w-24">
                    <label className="block text-xs text-stone-500 mb-1">ต้องการ (คน)</label>
                    <input type="number" value={t.headcount} onChange={(e) => setTask(t.id, { headcount: e.target.value })} placeholder="—" className="w-full px-3 py-2 border border-stone-300 rounded-lg text-center" />
                  </div>
                  <button onClick={() => rmTask(t.id)} className="p-2 hover:bg-red-50 rounded-lg text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>

                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-stone-600">พนักงานที่ทำงานนี้ {target > 0 ? <span className={assigned.length >= target ? 'text-emerald-600' : 'text-amber-600'}>({assigned.length}/{target})</span> : (assigned.length > 0 && <span className="text-stone-400">({assigned.length} คน)</span>)}</span>
                  {canSeePay && <span className="text-xs text-stone-500">รวมงานนี้ {fmtMoney(taskTotal)} ฿</span>}
                </div>

                <div className="space-y-1.5">
                  {assigned.map((a) => (
                    <div key={a.empId} className="flex items-center gap-2">
                      <span className="flex-1 text-sm text-stone-700 inline-flex items-center gap-1.5"><span className="inline-flex items-center justify-center w-5 h-5 bg-emerald-100 text-emerald-700 rounded-full text-[10px]">✓</span>{empName(a.empId)}{isOtherBiz(a.empId) && <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">ต่างธุรกิจ · {bizNameOf(a.empId)}</span>}</span>
                      {canSeePay && <input type="number" step="0.01" value={a.amount} onChange={(e) => setAssigneeAmount(t.id, a.empId, e.target.value)} placeholder={`${Number(t.defaultPay) || 0}`} className="w-24 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />}
                      {canSeePay && <span className="text-xs text-stone-400">฿</span>}
                      <button onClick={() => rmAssignee(t.id, a.empId)} className="p-1 hover:bg-red-50 rounded text-red-500"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  {available.length > 0 && (
                    <select value="" onChange={(e) => { addAssignee(t.id, e.target.value); e.target.value = ''; }} className="text-sm px-2 py-1.5 border border-stone-200 rounded bg-white text-stone-500">
                      <option value="">+ ดึงพนักงานเข้างานนี้ (ทุกธุรกิจ)</option>
                      {available.map((e) => <option key={e.id} value={e.id}>{dispName(e)}{businesses.find((b) => b.id === e.businessId)?.name ? ` · ${businesses.find((b) => b.id === e.businessId)?.name}` : ''}</option>)}
                    </select>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {tasks.length > 0 && (
          <button onClick={addTask} className="w-full py-2.5 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />เพิ่มงาน</button>
        )}

        {canSeePay && Object.keys(perEmp).length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm font-medium text-stone-700">ยอดที่จะบวกเข้าเงินเดือน (งานเสริม)</div>
              <div className="text-sm font-semibold text-emerald-800">รวม {fmtMoney(grandTotal)} ฿</div>
            </div>
            <div className="text-xs text-stone-500 space-y-0.5">
              {Object.entries(perEmp).map(([id, amt]) => (
                <div key={id} className="flex justify-between"><span>{empName(id)}{isOtherBiz(id) && <span className="text-amber-600"> · {bizNameOf(id)}</span>}</span><span>{fmtMoney(amt)} ฿</span></div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">ยอดนี้จะไปขึ้นเป็นรายการ "งานเสริม" ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะคนที่ยังไม่ได้ทำเงินเดือนงวดนี้) — ถ้าทำเงินเดือนไปแล้วให้แก้ที่หน้าเงินเดือนโดยตรง</p>
          </div>
        )}

        <FormField label="หมายเหตุงวดนี้"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg resize-none max-w-2xl" /></FormField>
      </div>
    </div>
  );
}


export {
  RecurringTaskPage,
};
