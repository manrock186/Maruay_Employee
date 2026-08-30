import React, { useState, useEffect, useMemo } from 'react';
import { Users, Plus, Trash2, Banknote, Check, Percent } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, fmt } from '../lib/payroll.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ COMMISSION PAGE (คอมมิชชั่น) ============
function CommissionPage({ businesses, employees, positions, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [posProfit, setPosProfit] = useState('');
  const [pool2Total, setPool2Total] = useState('');
  const [deductions, setDeductions] = useState([]);
  const [entries, setEntries] = useState({});
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dedCarried, setDedCarried] = useState(false); // รายการหักถูกดึงมาจากเดือนก่อน (ยังไม่บันทึก)

  const business = businesses.find((b) => b.id === activeBusinessId);
  const bizEmployees = useMemo(() => employees.filter((e) => isActive(e) && (e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))), [employees, activeBusinessId]);

  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const pool = await ops.commission.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      if (pool) {
        setDedCarried(false);
        setPosProfit(pool.posProfit ?? '');
        setPool2Total(pool.pool2Total ?? '');
        setDeductions(pool.deductions || []);
        setNote(pool.note || '');
        const em = {};
        (pool.entries || []).forEach((e) => { em[e.employeeId] = { pct: e.pct ?? '', amount: e.amount ?? '', pct2: e.pct2 ?? '', amount2: e.amount2 ?? '' }; });
        // เติม pct ตั้งต้นให้คนที่ยังไม่มี entry
        bizEmployees.forEach((e) => { if (!em[e.id] && e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '' }; });
        setEntries(em);
        setSavedAt(pool.updatedAt || pool.createdAt || null);
      } else {
        setPosProfit(''); setPool2Total(''); setNote(''); setSavedAt(null);
        // เดือนใหม่ที่ยังไม่เคยบันทึก → ดึง "รายการหัก" จากเดือนก่อนหน้ามาตั้งต้น (รายการเหมือนเดิม เปลี่ยนแค่ตัวเลข)
        const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
        const prevPool = await ops.commission.getByPeriod(activeBusinessId, prev.y, prev.m);
        if (cancelled) return;
        if (prevPool && (prevPool.deductions || []).length) {
          setDeductions(prevPool.deductions.map((d) => ({ label: d.label || '', amount: d.amount ?? '' })));
          setDedCarried(true);
        } else {
          setDeductions([]); setDedCarried(false);
        }
        const em = {};
        bizEmployees.forEach((e) => { if (e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '' }; });
        setEntries(em);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  const poolValue = (Number(posProfit) || 0) - deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const pool2Value = Number(pool2Total) || 0;
  const computedFor = (empId) => {
    const pct = Number(entries[empId]?.pct) || 0;
    return Math.round(poolValue * pct / 100 * 100) / 100;
  };
  const computedFor2 = (empId) => {
    const pct = Number(entries[empId]?.pct2) || 0;
    return Math.round(pool2Value * pct / 100 * 100) / 100;
  };
  const rowTotal = (empId) => (Number(entries[empId]?.amount) || 0) + (Number(entries[empId]?.amount2) || 0);
  const setEntry = (empId, patch) => setEntries((prev) => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));
  const fillFromPct = () => setEntries((prev) => {
    const next = { ...prev };
    bizEmployees.forEach((e) => {
      const pct = Number(next[e.id]?.pct) || 0;
      const pct2 = Number(next[e.id]?.pct2) || 0;
      next[e.id] = { ...next[e.id], amount: Math.round(poolValue * pct / 100 * 100) / 100, amount2: Math.round(pool2Value * pct2 / 100 * 100) / 100 };
    });
    return next;
  });
  const totalCommission = bizEmployees.reduce((s, e) => s + rowTotal(e.id), 0);
  const total1 = bizEmployees.reduce((s, e) => s + (Number(entries[e.id]?.amount) || 0), 0);
  const total2 = bizEmployees.reduce((s, e) => s + (Number(entries[e.id]?.amount2) || 0), 0);

  const addDeduction = () => setDeductions((d) => [...d, { label: '', amount: '' }]);
  const setDed = (i, patch) => setDeductions((d) => d.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const rmDed = (i) => setDeductions((d) => d.filter((_, idx) => idx !== i));

  const save = async () => {
    setSaving(true);
    const entryList = bizEmployees
      .map((e) => ({ employeeId: e.id, pct: Number(entries[e.id]?.pct) || 0, amount: Number(entries[e.id]?.amount) || 0, pct2: Number(entries[e.id]?.pct2) || 0, amount2: Number(entries[e.id]?.amount2) || 0 }))
      .filter((x) => x.amount !== 0 || x.pct !== 0 || x.amount2 !== 0 || x.pct2 !== 0);
    const ok = await ops.commission.upsert({
      businessId: activeBusinessId, periodYear: year, periodMonth: month,
      posProfit: Number(posProfit) || 0,
      pool2Total: Number(pool2Total) || 0,
      deductions: deductions.map((d) => ({ label: d.label || '', amount: Number(d.amount) || 0 })),
      entries: entryList, note: note.trim() || null,
    });
    setSaving(false);
    if (ok) { setSavedAt(new Date().toISOString()); setDedCarried(false); alert('บันทึกคอมมิชชั่นแล้ว — ยอดจะไปขึ้นช่องคอมฯ ในหน้าเงินเดือนของงวดนี้อัตโนมัติ'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="คอมมิชชั่น" /><div className="p-4 md:p-8"><EmptyState icon={Percent} title="เลือกธุรกิจที่ sidebar" description="คอมมิชชั่นคิดแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="คอมมิชชั่น" subtitle={`${business?.name || ''} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกคอม'}</button>
      </PageHeader>
      <div className="p-4 md:p-8 space-y-5 max-w-5xl">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {savedAt && <span className="text-xs text-stone-400">บันทึกล่าสุด {fmt(savedAt)}</span>}
        </div>

        {/* กองกลางคอม ก้อนที่ 1 */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-emerald-700" /><h3 className="text-sm font-medium text-stone-800">ก้อนที่ 1 — คอมจากยอดขาย POS</h3>
            <span className="text-xs text-stone-400">(ตอนนี้กรอกเอง — อนาคตดึงจาก POS อัตโนมัติ)</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="กำไรรวมจาก POS (บาท)">
              <input type="number" step="0.01" value={posProfit} onChange={(e) => setPosProfit(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" placeholder="เช่น 282359" />
            </FormField>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-stone-600">รายการหัก (น้ำไฟ, อื่นๆ)</span>
              <button onClick={addDeduction} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มรายการหัก</button>
            </div>
            <div className="space-y-2">
              {dedCarried && deductions.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ดึงรายการหักจากเดือนก่อนมาให้แล้ว — แก้ตัวเลขให้ตรงเดือนนี้ แล้วกดบันทึก</p>
              )}
              {deductions.length === 0 && <p className="text-xs text-stone-400">ยังไม่มีรายการหัก</p>}
              {deductions.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={d.label} onChange={(e) => setDed(i, { label: e.target.value })} className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-sm" placeholder="เช่น ค่าน้ำไฟ" />
                  <input type="number" step="0.01" value={d.amount} onChange={(e) => setDed(i, { amount: e.target.value })} className="w-32 px-3 py-1.5 border border-stone-300 rounded-lg text-sm text-right" placeholder="0" />
                  <button onClick={() => rmDed(i)} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-stone-100">
            <span className="text-sm font-medium text-stone-700">กองกลางก้อนที่ 1 (กำไร − หัก)</span>
            <span className="text-lg font-semibold text-emerald-800">{fmtMoney(poolValue)} ฿</span>
          </div>
        </div>

        {/* กองกลางคอม ก้อนที่ 2 */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-sky-700" /><h3 className="text-sm font-medium text-stone-800">ก้อนที่ 2 — คอมจากรายได้ร้านค้า (ตึกต่างๆ)</h3>
            <span className="text-xs text-stone-400">(กรอกยอดรวมเอง — รายละเอียดที่มาค่อยทำทีหลัง)</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ยอดรวมรายได้ร้านค้า (บาท)">
              <input type="number" step="0.01" value={pool2Total} onChange={(e) => setPool2Total(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/40" placeholder="เช่น 50000" />
            </FormField>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-stone-100">
            <span className="text-sm font-medium text-stone-700">กองกลางก้อนที่ 2</span>
            <span className="text-lg font-semibold text-sky-800">{fmtMoney(pool2Value)} ฿</span>
          </div>
        </div>

        {/* แบ่งให้พนักงาน */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-700" /><h3 className="text-sm font-medium text-stone-800">แบ่งคอมให้พนักงาน</h3></div>
            <button onClick={fillFromPct} className="text-xs px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-medium">เติมยอดจาก % (กองกลาง × %)</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-stone-500 border-b border-stone-200">
                  <th className="text-left py-2 px-2" rowSpan={2}>พนักงาน</th>
                  <th className="text-center py-1 px-2 bg-emerald-50/50" colSpan={2}>ก้อนที่ 1 (POS)</th>
                  <th className="text-center py-1 px-2 bg-sky-50/50" colSpan={2}>ก้อนที่ 2 (ร้านค้า)</th>
                  <th className="text-right py-2 px-2 w-32" rowSpan={2}>รวมคอม</th>
                </tr>
                <tr className="text-xs text-stone-500 border-b border-stone-200">
                  <th className="text-right py-1 px-2 w-20 bg-emerald-50/50">%</th>
                  <th className="text-right py-1 px-2 w-28 bg-emerald-50/50">คอม 1</th>
                  <th className="text-right py-1 px-2 w-20 bg-sky-50/50">%</th>
                  <th className="text-right py-1 px-2 w-28 bg-sky-50/50">คอม 2</th>
                </tr>
              </thead>
              <tbody>
                {bizEmployees.length === 0 && <tr><td colSpan={6} className="text-center text-stone-400 py-6">ไม่มีพนักงานในธุรกิจนี้</td></tr>}
                {bizEmployees.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50">
                    <td className="py-1.5 px-2">{dispName(e)}</td>
                    <td className="py-1.5 px-2 bg-emerald-50/30"><input type="number" step="0.001" value={entries[e.id]?.pct ?? ''} onChange={(ev) => setEntry(e.id, { pct: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-300 rounded text-right" placeholder="0" title={`คิดจาก % = ${fmtMoney(computedFor(e.id))}`} /></td>
                    <td className="py-1.5 px-2 bg-emerald-50/30"><input type="number" step="0.01" value={entries[e.id]?.amount ?? ''} onChange={(ev) => setEntry(e.id, { amount: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-300 rounded text-right text-emerald-800" placeholder="0" /></td>
                    <td className="py-1.5 px-2 bg-sky-50/30"><input type="number" step="0.001" value={entries[e.id]?.pct2 ?? ''} onChange={(ev) => setEntry(e.id, { pct2: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-300 rounded text-right" placeholder="0" title={`คิดจาก % = ${fmtMoney(computedFor2(e.id))}`} /></td>
                    <td className="py-1.5 px-2 bg-sky-50/30"><input type="number" step="0.01" value={entries[e.id]?.amount2 ?? ''} onChange={(ev) => setEntry(e.id, { amount2: ev.target.value })} className="w-full px-2 py-1.5 border border-stone-300 rounded text-right text-sky-800" placeholder="0" /></td>
                    <td className="py-1.5 px-2 text-right font-semibold text-stone-800">{fmtMoney(rowTotal(e.id))}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-semibold text-stone-800 border-t-2 border-stone-200">
                <td className="py-2 px-2">รวม</td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right text-emerald-800">{fmtMoney(total1)}</td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right text-sky-800">{fmtMoney(total2)}</td>
                <td className="py-2 px-2 text-right text-stone-900">{fmtMoney(totalCommission)} ฿</td>
              </tr></tfoot>
            </table>
          </div>
          <p className="text-xs text-stone-500 mt-3">ช่อง "คอม 1" และ "คอม 2" แก้เองได้เสมอ — <b>รวมคอม</b> (ก้อน 1 + ก้อน 2) จะไปขึ้นช่องคอมฯ ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ</p>
        </div>

        <FormField label="หมายเหตุงวดนี้">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg resize-none" />
        </FormField>
      </div>
    </div>
  );
}


export {
  CommissionPage,
};
