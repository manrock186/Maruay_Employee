import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Plus, Trash2, Banknote, Check, Percent, Upload, ClipboardPaste, ChevronDown, ChevronUp, X, RefreshCw, Layers, AlertCircle } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { NO_DEPT, employeeDepartment } from '../lib/order.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, fmt, holidayBalance } from '../lib/payroll.js';
import { parseLoyverseText, computeCommission } from '../lib/commission.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ COMMISSION PAGE (คอมมิชชั่น) ============
// ก้อนที่ 1 (POS): กองกลาง = กำไร Loyverse − รายการหัก → × % ต่อคน → หักวันหยุดเกินสิทธิ (÷30) → ส่วนที่หายแบ่งในแผนก
// ก้อนที่ 2 (ร้านค้า): ใส่ยอดมือไปก่อน (จะทำรายละเอียดทีหลัง)
function CommissionPage({ businesses, employees, positions, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [posProfit, setPosProfit] = useState('');
  const [posItems, setPosItems] = useState([]);      // รายการสินค้าจากไฟล์ Loyverse (เก็บไว้ดูย้อนหลัง)
  const [posImport, setPosImport] = useState(null);  // { fileName, importedAt, rows, net, cost, profit }
  const [showItems, setShowItems] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pool2Total, setPool2Total] = useState('');
  const [deductions, setDeductions] = useState([]);
  const [entries, setEntries] = useState({});
  const [payrollExcess, setPayrollExcess] = useState(null); // empId -> หยุดเกินจากหน้าเงินเดือน (null = ยังไม่โหลด)
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dedCarried, setDedCarried] = useState(false); // รายการหักถูกดึงมาจากเดือนก่อน (ยังไม่บันทึก)
  const fileRef = useRef(null);

  const business = businesses.find((b) => b.id === activeBusinessId);
  const bizEmployees = useMemo(() => employees.filter((e) => isActive(e) && (e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))), [employees, activeBusinessId]);

  // หยุดเกินสิทธิของงวดนี้จากแถวเงินเดือน (ถ้าทำเงินเดือนแล้ว) — ไม่ต้องกรอกซ้ำ
  const loadPayrollExcess = async () => {
    const rows = await ops.payroll.listByPeriod(activeBusinessId, year, month);
    const m = {};
    rows.forEach((p) => { m[p.employeeId] = { excess: Math.max(0, holidayBalance(p).excess), status: p.status, commission: Number(p.commission) || 0 }; });
    return m;
  };

  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [pool, pe] = await Promise.all([ops.commission.getByPeriod(activeBusinessId, year, month), loadPayrollExcess()]);
      if (cancelled) return;
      setPayrollExcess(pe);
      const emFromProfile = () => { const em = {}; bizEmployees.forEach((e) => { if (e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '', excessDays: '' }; }); return em; };
      if (pool) {
        setDedCarried(false);
        setPosProfit(pool.posProfit ?? '');
        setPosItems(Array.isArray(pool.posItems) ? pool.posItems : []);
        setPosImport(pool.posImport || null);
        setPool2Total(pool.pool2Total ?? '');
        setDeductions(pool.deductions || []);
        setNote(pool.note || '');
        const em = {};
        (pool.entries || []).forEach((e) => { em[e.employeeId] = { pct: e.pct ?? '', amount: e.amount ?? '', pct2: e.pct2 ?? '', amount2: e.amount2 ?? '', excessDays: e.excessDays ?? '' }; });
        // เติม pct ตั้งต้นให้คนที่ยังไม่มี entry
        bizEmployees.forEach((e) => { if (!em[e.id] && e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '', excessDays: '' }; });
        setEntries(em);
        setSavedAt(pool.updatedAt || pool.createdAt || null);
      } else {
        setPosProfit(''); setPosItems([]); setPosImport(null); setPool2Total(''); setNote(''); setSavedAt(null);
        // เดือนใหม่ที่ยังไม่เคยบันทึก → ดึง "รายการหัก" จากเดือนก่อนหน้ามาตั้งต้น (รายการเหมือนเดิม เปลี่ยนแค่ตัวเลข)
        const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
        const prevPool = await ops.commission.getByPeriod(activeBusinessId, prev.y, prev.m);
        if (cancelled) return;
        if (prevPool && (prevPool.deductions || []).length) {
          setDeductions(prevPool.deductions.map((d) => ({ label: d.label || '', amount: '' })));
          setDedCarried(true);
        } else {
          setDeductions([]); setDedCarried(false);
        }
        setEntries(emFromProfile());
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  // ---- นำเข้าไฟล์ Loyverse ----
  const applyImport = (text, fileName) => {
    const r = parseLoyverseText(text);
    if (r.error) { alert(r.error); return false; }
    setPosItems(r.items);
    setPosImport({ fileName: fileName || 'วางจาก Excel', importedAt: new Date().toISOString(), rows: r.items.length, qty: r.totals.qty, net: r.totals.net, cost: r.totals.cost, profit: r.totals.profit });
    setPosProfit(r.totals.profit);
    setShowItems(false); setPasteOpen(false); setPasteText('');
    return true;
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { applyImport(await f.text(), f.name); } finally { e.target.value = ''; }
  };
  const clearImport = () => { setPosItems([]); setPosImport(null); };

  // ---- คำนวณ ----
  const poolValue = (Number(posProfit) || 0) - deductions.reduce((s, d) => s + (Number(d.amount) || 0), 0);
  const pool2Value = Number(pool2Total) || 0;
  const setEntry = (empId, patch) => setEntries((prev) => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));
  const computedFor = (empId) => Math.round(poolValue * (Number(entries[empId]?.pct) || 0) / 100 * 100) / 100;
  const computedFor2 = (empId) => Math.round(pool2Value * (Number(entries[empId]?.pct2) || 0) / 100 * 100) / 100;
  const fillFromPct = () => setEntries((prev) => {
    const next = { ...prev };
    bizEmployees.forEach((e) => {
      const pct = Number(next[e.id]?.pct) || 0;
      const pct2 = Number(next[e.id]?.pct2) || 0;
      next[e.id] = { ...next[e.id], amount: pct ? Math.round(poolValue * pct / 100 * 100) / 100 : (next[e.id]?.amount ?? ''), amount2: pct2 ? Math.round(pool2Value * pct2 / 100 * 100) / 100 : (next[e.id]?.amount2 ?? '') };
    });
    return next;
  });
  // หยุดเกิน: ถ้ามีแถวเงินเดือนของงวดนี้ ใช้ค่าจากเงินเดือนเสมอ (เป็นที่เดียวที่กรอกวันหยุด) · ยังไม่ทำเงินเดือน → กรอกเองได้
  const excessFor = (empId) => {
    const fromPayroll = payrollExcess?.[empId];
    if (fromPayroll) return fromPayroll.excess;
    return Number(entries[empId]?.excessDays) || 0;
  };
  const deptOf = (e) => employeeDepartment(e, positions, activeBusinessId);
  const calc = useMemo(() => computeCommission({
    poolValue,
    rows: bizEmployees.map((e) => ({ id: e.id, dept: deptOf(e), pct: entries[e.id]?.pct, amount: entries[e.id]?.amount, amount2: entries[e.id]?.amount2, excessDays: excessFor(e.id) })),
  }), [bizEmployees, entries, poolValue, payrollExcess, positions, activeBusinessId]);
  const calcById = useMemo(() => { const m = {}; calc.rows.forEach((r) => { m[r.id] = r; }); return m; }, [calc]);

  // จัดกลุ่มตามแผนก (ลำดับตาม employees ที่เรียงมาแล้ว)
  const groups = useMemo(() => {
    const map = new Map();
    bizEmployees.forEach((e) => { const d = deptOf(e); if (!map.has(d)) map.set(d, { id: d, rows: [] }); map.get(d).rows.push(e); });
    const out = [...map.values()];
    out.sort((a, b) => (a.id === NO_DEPT ? 1 : b.id === NO_DEPT ? -1 : 0));
    return out;
  }, [bizEmployees, positions, activeBusinessId]);

  const addDeduction = () => setDeductions((d) => [...d, { label: '', amount: '' }]);
  const setDed = (i, patch) => setDeductions((d) => d.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const rmDed = (i) => setDeductions((d) => d.filter((_, idx) => idx !== i));

  const refreshExcess = async () => { setPayrollExcess(await loadPayrollExcess()); };

  const save = async () => {
    if (poolValue < 0) { alert(`กองกลางก้อนที่ 1 ติดลบ (${fmtMoney(poolValue)}) — รายการหักมากกว่ากำไร POS\nตรวจตัวเลขก่อนบันทึก`); return; }
    setSaving(true);
    try {
      // เงินเดือนงวดนี้อาจถูกทำ/แก้หลังจากเปิดหน้านี้ → ดึงใหม่ก่อน ถ้าเปลี่ยนให้ผู้ใช้ดูวันหยุดใหม่ก่อนบันทึก (ไม่งั้นจะ sync ยอดเก่า)
      const fresh = await loadPayrollExcess();
      if (JSON.stringify(fresh) !== JSON.stringify(payrollExcess || {})) {
        setPayrollExcess(fresh);
        alert('เงินเดือนงวดนี้ถูกแก้หลังจากเปิดหน้านี้ — อัปเดตวันหยุดเกินให้แล้ว ตรวจตัวเลขแล้วกด "บันทึกคอม" อีกครั้ง');
        return;
      }
      const entryList = bizEmployees
        .map((e) => {
          const r = calcById[e.id] || {};
          const a = entries[e.id]?.amount;
          const override = a != null && a !== '';
          return {
            employeeId: e.id,
            // amount = ยอดที่ "กำหนดเอง" เท่านั้น (null = คิดจาก % × กองกลาง ทุกครั้งที่เปิด) · base1 = ยอดที่ใช้จริงตอนบันทึก
            pct: Number(entries[e.id]?.pct) || 0, amount: override ? r.base1 : null, base1: r.base1 || 0,
            pct2: Number(entries[e.id]?.pct2) || 0, amount2: r.base2 || 0,
            excessDays: r.excessDays || 0, forfeited: r.forfeited || 0, share: r.share || 0, final: r.final || 0,
          };
        })
        .filter((x) => x.base1 !== 0 || x.pct !== 0 || x.amount2 !== 0 || x.pct2 !== 0 || x.final !== 0);
      const ok = await ops.commission.upsert({
        businessId: activeBusinessId, periodYear: year, periodMonth: month,
        posProfit: Number(posProfit) || 0,
        posItems: posItems || [],
        posImport: posImport || null,
        pool2Total: Number(pool2Total) || 0,
        deductions: deductions.map((d) => ({ label: d.label || '', amount: Number(d.amount) || 0 })),
        entries: entryList, note: note.trim() || null,
      });
      if (!ok) return;
      setSavedAt(new Date().toISOString()); setDedCarried(false);
      // แถวเงินเดือนของงวดนี้ที่มีอยู่แล้ว → อัปเดตช่องคอมให้ตรง (เฉพาะงวดที่ยังไม่ปิด)
      // ไม่งั้นคอมจะเข้าเงินเดือนเฉพาะคนที่ "ยังไม่ได้ทำเงินเดือน" เท่านั้น (บทเรียนเดียวกับงานเสริมประจำ)
      const pe = payrollExcess || {};
      const finalBy = {}; entryList.forEach((x) => { finalBy[x.employeeId] = x.final; });
      const toUpdate = [], locked = [];
      bizEmployees.forEach((e) => {
        const p = pe[e.id]; if (!p) return;
        const want = Math.round((finalBy[e.id] || 0) * 100) / 100;
        if (Math.abs(want - p.commission) < 0.005) return;
        (p.status === 'finalized' ? locked : toUpdate).push({ emp: e, want });
      });
      let updated = 0, failed = [];
      if (toUpdate.length) {
        const res = await ops.commission.syncToPayroll(activeBusinessId, year, month, toUpdate.map((x) => ({ employeeId: x.emp.id, commission: x.want })));
        updated = res.updated; failed = res.failed || [];
        setPayrollExcess(await loadPayrollExcess());
      }
      const lines = ['บันทึกคอมมิชชั่นแล้ว'];
      if (updated) lines.push(`อัปเดตช่องคอมในหน้าเงินเดือนงวดนี้ให้ ${updated} คนที่ทำเงินเดือนไปแล้ว`);
      if (failed.length) lines.push(`อัปเดตเงินเดือนไม่สำเร็จ ${failed.length} คน: ${failed.map((id) => dispName(bizEmployees.find((e) => e.id === id) || {})).join(', ')} — ลองรีเฟรชแล้วบันทึกใหม่`);
      if (locked.length) lines.push(`${locked.length} คนปิดงวดแล้ว ไม่ได้แก้ให้: ${locked.map((x) => dispName(x.emp)).join(', ')} — เปิด "แก้ไขงวดนี้" ที่หน้าเงินเดือนถ้าต้องการ`);
      lines.push('คนที่ยังไม่ได้ทำเงินเดือน ยอดจะเข้าเองตอนทำ');
      alert(lines.join('\n'));
    } finally { setSaving(false); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="คอมมิชชั่น" /><div className="p-4 md:p-8"><EmptyState icon={Percent} title="เลือกธุรกิจที่ sidebar" description="คอมมิชชั่นคิดแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  const numCell = 'w-full px-2 py-1.5 border border-stone-300 rounded text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
  const payrollDone = payrollExcess ? Object.keys(payrollExcess).length : 0;
  const distributedPct = calc.totals.pct;

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="คอมมิชชั่น" subtitle={`${business?.name || ''} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving || loading} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกคอม'}</button>
      </PageHeader>
      <div className="p-4 md:p-8 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} disabled={saving} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white disabled:bg-stone-100">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} disabled={saving} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white disabled:bg-stone-100">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {savedAt && <span className="text-xs text-stone-400">บันทึกล่าสุด {fmt(savedAt)}</span>}
          {loading && <span className="text-xs text-stone-400">กำลังโหลด...</span>}
        </div>

        {/* ก้อนที่ 1 — กำไร POS */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap"><Banknote className="w-4 h-4 text-emerald-700" /><h3 className="text-sm font-medium text-stone-800">ก้อนที่ 1 — กำไรจากยอดขาย POS (Loyverse)</h3></div>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 rounded-lg text-sm font-medium"><Upload className="w-4 h-4" />นำเข้าไฟล์จาก Loyverse (.csv)</button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={onFile} className="hidden" />
            <button onClick={() => setPasteOpen((v) => !v)} className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 rounded-lg text-sm font-medium"><ClipboardPaste className="w-4 h-4" />วางข้อมูลจาก Excel</button>
            <span className="text-xs text-stone-400">Loyverse → รายงาน "ยอดขายตามสินค้า" → Export CSV · หรือ copy ตารางจาก Excel (ต้องมีหัวคอลัมน์ Gross profit)</span>
          </div>
          {pasteOpen && (
            <div className="space-y-2">
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={5} placeholder={'วางตารางที่ copy จาก Excel/Loyverse ที่นี่ (บรรทัดแรกเป็นหัวคอลัมน์ เช่น Item name … Gross profit)'} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-xs font-mono resize-y" />
              <div className="flex gap-2">
                <button onClick={() => applyImport(pasteText, 'วางจาก Excel')} disabled={!pasteText.trim()} className="px-3 py-1.5 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 text-white rounded-lg text-sm font-medium">อ่านข้อมูล</button>
                <button onClick={() => { setPasteOpen(false); setPasteText(''); }} className="px-3 py-1.5 text-stone-600 hover:bg-stone-100 rounded-lg text-sm">ยกเลิก</button>
              </div>
            </div>
          )}
          {posImport && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-3 text-sm">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="text-emerald-900">
                  <b>นำเข้าแล้ว {posImport.rows} รายการ</b> <span className="text-xs text-stone-500">({posImport.fileName} · {fmt(posImport.importedAt)})</span>
                  <div className="text-xs text-stone-600 mt-0.5">ยอดขายสุทธิ {fmtMoney(posImport.net)} − ต้นทุน {fmtMoney(posImport.cost)} = <b className="text-emerald-800">กำไร {fmtMoney(posImport.profit)} ฿</b></div>
                </div>
                <div className="flex gap-1">
                  {posItems.length > 0 && <button onClick={() => setShowItems((v) => !v)} className="flex items-center gap-1 px-2 py-1 text-xs text-stone-600 hover:bg-white rounded">{showItems ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{showItems ? 'ซ่อนรายการ' : 'ดูรายการ'}</button>}
                  <button onClick={clearImport} title="ล้างข้อมูลที่นำเข้า" className="p-1 text-stone-400 hover:text-red-500 hover:bg-white rounded"><X className="w-4 h-4" /></button>
                </div>
              </div>
              {showItems && posItems.length > 0 && (
                <div className="mt-2 overflow-x-auto rounded-lg border border-emerald-100 bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-stone-50 text-stone-500"><tr><th className="text-left px-2 py-1.5">สินค้า</th><th className="text-right px-2 py-1.5">จำนวน</th><th className="text-right px-2 py-1.5">ยอดขายสุทธิ</th><th className="text-right px-2 py-1.5">ต้นทุน</th><th className="text-right px-2 py-1.5">กำไร</th></tr></thead>
                    <tbody className="divide-y divide-stone-100">
                      {posItems.map((it, i) => (
                        <tr key={i}><td className="px-2 py-1 text-stone-700">{it.name}</td><td className="px-2 py-1 text-right text-stone-500">{it.qty || '—'}</td><td className="px-2 py-1 text-right">{fmtMoney(it.net)}</td><td className="px-2 py-1 text-right text-stone-500">{fmtMoney(it.cost)}</td><td className={`px-2 py-1 text-right font-medium ${it.profit < 0 ? 'text-red-600' : 'text-emerald-800'}`}>{fmtMoney(it.profit)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="กำไรรวมจาก POS (บาท)">
              <input type="number" step="0.01" value={posProfit} onChange={(e) => setPosProfit(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" placeholder="เช่น 335574.69" />
              <p className="text-xs text-stone-400 mt-1">{posImport ? 'เติมจากไฟล์ที่นำเข้า — แก้ทับได้' : 'นำเข้าไฟล์ด้านบน หรือกรอกเอง'}</p>
            </FormField>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-stone-600">รายการหัก (น้ำไฟรวม, น้ำไฟที่ขาดทุน, ช้อนส้อม ฯลฯ)</span>
              <button onClick={addDeduction} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มรายการหัก</button>
            </div>
            <div className="space-y-2">
              {dedCarried && deductions.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ดึงชื่อรายการหักจากเดือนก่อนมาให้แล้ว — ใส่ตัวเลขของเดือนนี้ แล้วกดบันทึก</p>
              )}
              {deductions.length === 0 && <p className="text-xs text-stone-400">ยังไม่มีรายการหัก</p>}
              {deductions.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={d.label} onChange={(e) => setDed(i, { label: e.target.value })} className="flex-1 px-3 py-1.5 border border-stone-300 rounded-lg text-sm" placeholder="เช่น น้ำไฟรวม" />
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

        {/* ก้อนที่ 2 */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2"><Banknote className="w-4 h-4 text-sky-700" /><h3 className="text-sm font-medium text-stone-800">ก้อนที่ 2 — คอมจากรายได้ร้านค้า</h3>
            <span className="text-xs text-stone-400">(ใส่ยอดรวมเอง — รายละเอียดที่มาค่อยทำทีหลัง)</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="ยอดรวมรายได้ร้านค้า (บาท)">
              <input type="number" step="0.01" value={pool2Total} onChange={(e) => setPool2Total(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500/40" placeholder="0" />
            </FormField>
          </div>
        </div>

        {/* แบ่งให้พนักงาน */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2"><Users className="w-4 h-4 text-emerald-700" /><h3 className="text-sm font-medium text-stone-800">แบ่งคอมให้พนักงาน</h3></div>
            <div className="flex items-center gap-2">
              <button onClick={refreshExcess} title="ดึงวันหยุดเกินสิทธิจากหน้าเงินเดือนใหม่" className="text-xs px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-medium flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" />วันหยุดจากเงินเดือน</button>
              <button onClick={fillFromPct} className="text-xs px-2.5 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-stone-700 font-medium">เติมยอดจาก % (กองกลาง × %)</button>
            </div>
          </div>
          <p className="text-xs text-stone-500 mb-3">
            หยุดเกินสิทธิ: {payrollDone > 0 ? <>ดึงจากหน้าเงินเดือนงวดนี้ ({payrollDone} คนทำแล้ว) — ช่องสีเทาแก้ที่หน้าเงินเดือน</> : <>ยังไม่มีใครทำเงินเดือนงวดนี้ — กรอกเองได้ก่อน พอทำเงินเดือนแล้วระบบจะใช้ค่าจากเงินเดือนแทน</>}
            {' '}· หัก (30 − หยุดเกิน) ÷ 30 ของ "รวม" · ส่วนที่หายไปแบ่งเท่ากันให้คนในแผนกเดียวกันที่ไม่ได้หยุด
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[980px]">
              <thead>
                <tr className="text-xs text-stone-500 border-b border-stone-200">
                  <th className="text-left py-2 px-2" rowSpan={2}>พนักงาน</th>
                  <th className="text-center py-1 px-2 bg-emerald-50/50" colSpan={2}>ก้อนที่ 1 (POS)</th>
                  <th className="text-center py-1 px-2 bg-sky-50/50" colSpan={2}>ก้อนที่ 2 (ร้านค้า)</th>
                  <th className="text-right py-2 px-2" rowSpan={2}>รวม</th>
                  <th className="text-center py-1 px-2 bg-amber-50/60" colSpan={3}>วันหยุดเกินสิทธิ</th>
                  <th className="text-right py-2 px-2 w-28" rowSpan={2}>สุทธิ</th>
                </tr>
                <tr className="text-xs text-stone-500 border-b border-stone-200">
                  <th className="text-right py-1 px-2 w-20 bg-emerald-50/50">%</th>
                  <th className="text-right py-1 px-2 w-28 bg-emerald-50/50">คอม 1</th>
                  <th className="text-right py-1 px-2 w-20 bg-sky-50/50">%</th>
                  <th className="text-right py-1 px-2 w-28 bg-sky-50/50">คอม 2</th>
                  <th className="text-right py-1 px-2 w-16 bg-amber-50/60">วัน</th>
                  <th className="text-right py-1 px-2 w-24 bg-amber-50/60">หลังหัก</th>
                  <th className="text-right py-1 px-2 w-24 bg-amber-50/60">รับแบ่ง</th>
                </tr>
              </thead>
              <tbody>
                {bizEmployees.length === 0 && <tr><td colSpan={10} className="text-center text-stone-400 py-6">ไม่มีพนักงานในธุรกิจนี้</td></tr>}
                {groups.map((g) => {
                  const dc = calc.depts[g.id] || { forfeited: 0, recipients: 0, share: 0, unassigned: 0 };
                  return (
                    <React.Fragment key={g.id}>
                      <tr className="bg-stone-100/70">
                        <td colSpan={10} className="px-2 py-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Layers className="w-3.5 h-3.5 text-stone-400" />
                            <span className="text-xs font-semibold text-stone-600">{g.id}</span>
                            <span className="text-xs text-stone-400">({g.rows.length})</span>
                            {dc.forfeited > 0 && (
                              dc.recipients > 0
                                ? <span className="text-[11px] text-amber-700">หายจากคนหยุด {fmtMoney(dc.forfeited)} → แบ่ง {dc.recipients} คน คนละ {fmtMoney(dc.share)}</span>
                                : <span className="text-[11px] text-red-600 flex items-center gap-1"><AlertCircle className="w-3 h-3" />หายจากคนหยุด {fmtMoney(dc.forfeited)} — ไม่มีคนในแผนกรับ (คงไว้กับบริษัท)</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {g.rows.map((e) => {
                        const r = calcById[e.id] || {};
                        const pe = payrollExcess?.[e.id];
                        const amountSet = entries[e.id]?.amount != null && entries[e.id]?.amount !== '';
                        return (
                          <tr key={e.id} className="border-b border-stone-50">
                            <td className="py-1.5 px-2 whitespace-nowrap"><span className="font-mono text-xs text-stone-400 mr-1">#{e.employeeNumber}</span>{dispName(e)}</td>
                            <td className="py-1.5 px-2 bg-emerald-50/30"><input type="number" step="0.001" value={entries[e.id]?.pct ?? ''} onChange={(ev) => setEntry(e.id, { pct: ev.target.value })} className={numCell} placeholder="0" /></td>
                            <td className="py-1.5 px-2 bg-emerald-50/30">
                              <input type="number" step="0.01" value={entries[e.id]?.amount ?? ''} onChange={(ev) => setEntry(e.id, { amount: ev.target.value })} className={`${numCell} ${amountSet ? 'text-emerald-800' : 'text-stone-500'}`} placeholder={fmtMoney(computedFor(e.id))} title={amountSet ? 'ยอดที่กำหนดเอง (ลบออกเพื่อกลับไปใช้ % × กองกลาง)' : `คิดจาก % อัตโนมัติ = ${fmtMoney(computedFor(e.id))}`} />
                            </td>
                            <td className="py-1.5 px-2 bg-sky-50/30"><input type="number" step="0.001" value={entries[e.id]?.pct2 ?? ''} onChange={(ev) => setEntry(e.id, { pct2: ev.target.value })} className={numCell} placeholder="0" title={`คิดจาก % = ${fmtMoney(computedFor2(e.id))}`} /></td>
                            <td className="py-1.5 px-2 bg-sky-50/30"><input type="number" step="0.01" value={entries[e.id]?.amount2 ?? ''} onChange={(ev) => setEntry(e.id, { amount2: ev.target.value })} className={`${numCell} text-sky-800`} placeholder="0" /></td>
                            <td className="py-1.5 px-2 text-right text-stone-700">{r.total ? fmtMoney(r.total) : <span className="text-stone-300">—</span>}</td>
                            <td className="py-1.5 px-2 bg-amber-50/30">
                              {pe
                                ? <div className={`text-right px-2 py-1.5 rounded bg-stone-100 ${pe.excess > 0 ? 'text-red-600 font-medium' : 'text-stone-400'}`} title="จากหน้าเงินเดือน (แก้ที่นั่น)">{pe.excess || 0}</div>
                                : <input type="number" min="0" step="0.5" value={entries[e.id]?.excessDays ?? ''} onChange={(ev) => setEntry(e.id, { excessDays: ev.target.value })} className={`${numCell} ${Number(entries[e.id]?.excessDays) > 0 ? 'text-red-600' : ''}`} placeholder="0" />}
                            </td>
                            <td className="py-1.5 px-2 bg-amber-50/30 text-right text-stone-700">{r.forfeited > 0 ? <span className="text-red-600">{fmtMoney(r.prorated)} <span className="text-[10px]">(−{fmtMoney(r.forfeited)})</span></span> : (r.total ? fmtMoney(r.prorated) : <span className="text-stone-300">—</span>)}</td>
                            <td className="py-1.5 px-2 bg-amber-50/30 text-right">{r.share > 0 ? <span className="text-emerald-700">+{fmtMoney(r.share)}</span> : <span className="text-stone-300">—</span>}</td>
                            <td className="py-1.5 px-2 text-right font-semibold text-stone-900">
                              {r.final ? fmtMoney(r.final) : <span className="text-stone-300">—</span>}
                              {pe && Math.abs((pe.commission || 0) - (r.final || 0)) >= 0.005 && (
                                <div className="text-[10px] font-normal text-amber-700 whitespace-nowrap" title={`ช่องคอมในเงินเดือนตอนนี้ ${fmtMoney(pe.commission)} — กด "บันทึกคอม" เพื่ออัปเดต`}>เงินเดือน {fmtMoney(pe.commission)}{pe.status === 'finalized' ? ' (ปิดงวด)' : ''}</div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot><tr className="font-semibold text-stone-800 border-t-2 border-stone-200">
                <td className="py-2 px-2">รวม</td>
                <td className="py-2 px-2 text-right text-stone-500 text-xs">{distributedPct ? `${Math.round(distributedPct * 1000) / 1000}%` : ''}</td>
                <td className="py-2 px-2 text-right text-emerald-800">{fmtMoney(calc.totals.base1)}</td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right text-sky-800">{fmtMoney(calc.totals.base2)}</td>
                <td className="py-2 px-2 text-right">{fmtMoney(calc.totals.total)}</td>
                <td className="py-2 px-2"></td>
                <td className="py-2 px-2 text-right text-red-600 text-xs">{calc.totals.forfeited > 0 ? `−${fmtMoney(calc.totals.forfeited)}` : ''}</td>
                <td className="py-2 px-2 text-right text-emerald-700 text-xs">{calc.totals.share > 0 ? `+${fmtMoney(calc.totals.share)}` : ''}</td>
                <td className="py-2 px-2 text-right text-stone-900">{fmtMoney(calc.totals.final)} ฿</td>
              </tr></tfoot>
            </table>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-stone-500 mt-3">
            <span>กองกลางก้อนที่ 1 {fmtMoney(poolValue)} ฿ → แจกตาม % รวม {Math.round(distributedPct * 1000) / 1000}% = <b className="text-emerald-800">{fmtMoney(calc.totals.base1)} ฿</b> (ที่เหลืออยู่กับบริษัท)</span>
            {calc.totals.unassigned > 0 && <span className="text-red-600">ส่วนที่หายไปแต่ไม่มีคนรับ {fmtMoney(calc.totals.unassigned)} ฿</span>}
            <span><b>สุทธิ</b> ของแต่ละคนจะไปขึ้นช่องคอมฯ ในหน้าเงินเดือนงวดเดียวกัน (กดบันทึกแล้วอัปเดตให้คนที่ทำเงินเดือนไปแล้วด้วย)</span>
          </div>
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
