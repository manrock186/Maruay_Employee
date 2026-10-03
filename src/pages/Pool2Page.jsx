import React, { useState, useEffect, useMemo } from 'react';
import { Check, Layers, Settings2, Plus, Trash2, ChevronDown, ChevronUp, ClipboardList, AlertTriangle, History, Gift, TrendingUp, TrendingDown } from 'lucide-react';
import { dispName } from '../lib/format.js';
import { MONTH_NAMES, fmtMoney, fmt } from '../lib/payroll.js';
import { isSubmitted, editedAfterSubmit, periodLabel } from '../lib/dataForms.js';
import { POOL2_KINDS, computePool2, snapshotOf, personOrder, pool2Changed, rateActive, sortSteps } from '../lib/pool2.js';
import { MoneyInput } from '../components/DataFormFields.jsx';
import { EmptyState, PageHeader, Modal } from '../ui/index.jsx';

// ============ คอมก้อนที่ 2 — รายได้ค่าเช่า/ร้านค้า (ข้ามธุรกิจ) ============
// ข้อมูลรายเดือน: ฟอร์ม "ผู้เช่าเข้า-ออก…" ที่ผู้จัดการกรอก (รายได้แต่ละส่วน + ห้องเข้า/ออก) + ยอดที่เจ้าของใส่เอง (% ผลกำไรฟอเรส+มอลล์) + คอมพิเศษรายคน
// กด "บันทึก" = เก็บผลรายคนของงวด (results) → หน้าคอมมิชชั่นของธุรกิจหลักของแต่ละคนดึงไปใส่ช่อง "คอม 2" ให้เอง
// งวดที่นำเข้าจาก Excel (results.source = 'excel') โชว์ยอดจาก Excel เป็นหลัก + ผลคำนวณด้วยเรทปัจจุบันไว้เทียบ
function Pool2Page({ businesses, employees, dataForms = [], profiles = [], profile, initialPeriod, onOpenForms, ops }) {
  const now = new Date();
  // เปิดจากหน้าคอม → ใช้งวดเดียวกับหน้าคอม (กันบันทึกผิดเดือน)
  const [year, setYear] = useState(initialPeriod?.year || now.getFullYear());
  const [month, setMonth] = useState(initialPeriod?.month || now.getMonth() + 1);
  const [config, setConfig] = useState(null);       // { sections, formId }
  const [cfgLoaded, setCfgLoaded] = useState(false);
  const [sub, setSub] = useState(null);             // ข้อมูลฟอร์มผู้จัดการของงวด
  const [row, setRow] = useState(null);             // commission_pool2 ของงวด (ที่บันทึกไว้)
  const [inputs, setInputs] = useState({});
  const [bonuses, setBonuses] = useState([]);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openSec, setOpenSec] = useState(null);
  const [editingCfg, setEditingCfg] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  const period = useMemo(() => ({ year, month }), [year, month]);
  const empById = useMemo(() => { const m = {}; employees.forEach((e) => { m[e.id] = e; }); return m; }, [employees]);
  const bizName = (id) => businesses.find((b) => b.id === id)?.name || '';
  const nameOf = (id) => (String(id).startsWith('name:') ? String(id).slice(5) : (empById[id] ? dispName(empById[id]) : 'ไม่พบชื่อ'));
  const form = dataForms.find((f) => f.id === config?.formId);
  const assignee = profiles.find((p) => p.id === form?.assigneeUserId)?.name;

  useEffect(() => {
    (async () => {
      const [cfg, hist] = await Promise.all([ops.pool2.getConfig(), ops.pool2.list()]);
      setConfig(cfg); setHistory(hist); setCfgLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!cfgLoaded) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [s, r] = await Promise.all([
        config?.formId ? ops.dataSubmission.get(config.formId, year, month) : null,
        ops.pool2.get(year, month),
      ]);
      if (cancelled) return;
      setSub(s); setRow(r);
      setInputs(r?.inputs || {}); setBonuses(Array.isArray(r?.bonuses) ? r.bonuses : []); setNote(r?.note || '');
      setOpenSec(null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [cfgLoaded, config?.formId, year, month]);

  const sections = config?.sections || [];
  const res = useMemo(() => computePool2({ sections, answers: sub?.answers || {}, inputs, bonuses, period }), [sections, sub, inputs, bonuses, period]);
  const isExcel = row?.results?.source === 'excel';
  const saved = row?.results?.persons || null;
  const changed = useMemo(() => (saved && !isExcel ? pool2Changed(saved, res.persons) : []), [saved, isExcel, res]);
  const fixedSections = sections.filter((s) => s.active !== false && s.kind === 'fixed');

  // คนที่โชว์ในสรุป: ตามลำดับเรท (เฉพาะที่มีเรทงวดนี้ หรือมียอด) + คนที่ได้คอมพิเศษ + คนในยอด Excel
  const people = useMemo(() => {
    const order = personOrder(sections);
    const ids = new Set([...Object.keys(res.persons), ...(isExcel ? Object.keys(saved || {}) : [])]);
    const active = order.filter((id) => ids.has(id) || sections.some((s) => (s.rates || []).some((r) => r.empId === id && rateActive(r, period))));
    return [...active, ...[...ids].filter((id) => !active.includes(id))];
  }, [sections, res, isExcel, saved, period]);

  const setBonus = (i, patch) => setBonuses((b) => b.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));

  const save = async () => {
    if (isExcel && !window.confirm('งวดนี้เป็นยอดที่นำเข้าจาก Excel — บันทึกทับด้วยการคำนวณของแอพ (เรทปัจจุบัน)?\nยอดรายคนจะเปลี่ยนตามตาราง "คำนวณด้วยเรทปัจจุบัน"')) return;
    if (!sub && !window.confirm('ผู้จัดการยังไม่ได้กรอกข้อมูลงวดนี้ — บันทึกไปก่อน?')) return;
    if (sub && !isSubmitted(sub) && !window.confirm('ข้อมูลจากผู้จัดการยังเป็น "ร่าง" (ยังไม่กดส่ง) — บันทึกด้วยตัวเลขนี้เลย?')) return;
    const missing = fixedSections.filter((s) => inputs[s.key] == null || String(inputs[s.key]).trim() === '');
    if (missing.length && !window.confirm(`ยังไม่ได้ใส่ "${missing.map((s) => s.name).join(', ')}" — บันทึกเป็น 0 ไปก่อน?`)) return;
    setSaving(true);
    try {
      const cleanBonuses = bonuses.filter((b) => b.empId && Number(b.amount)).map((b) => ({ empId: b.empId, amount: Number(b.amount), note: String(b.note || '').trim() }));
      const cleanInputs = Object.fromEntries(Object.entries(inputs).filter(([, v]) => v !== '' && v != null).map(([k, v]) => [k, Number(v) || 0]));
      const r = await ops.pool2.upsert({
        periodYear: year, periodMonth: month, inputs: cleanInputs, bonuses: cleanBonuses, note: note.trim() || null,
        results: { source: 'app', savedAt: new Date().toISOString(), ...snapshotOf(res) },
      });
      if (!r) return;
      setRow(r); setBonuses(cleanBonuses);
      setHistory(await ops.pool2.list());
      alert('บันทึกคอมก้อนที่ 2 แล้ว\nยอดรายคนจะไปขึ้นช่อง "คอม 2" ในหน้าคอมมิชชั่นของธุรกิจหลักของแต่ละคน (เปิดหน้าคอมแล้วกด "บันทึกคอม" ของธุรกิจนั้นด้วย)');
    } finally { setSaving(false); }
  };

  const yearOptions = [now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  if (cfgLoaded && !config) return (
    <div className="h-full overflow-auto"><PageHeader title="คอมก้อนที่ 2" /><div className="p-4 md:p-8"><EmptyState icon={Layers} title="ยังไม่มีการตั้งค่าคอมก้อนที่ 2" description="หรือบัญชีนี้ไม่มีสิทธิ์ดู" /></div></div>
  );

  const money = (n, cls = '') => <span className={`tabular-nums ${Number(n) < 0 ? 'text-red-600' : cls}`}>{fmtMoney(n)}</span>;
  const kindLabel = (s) => (s.kind === 'percent' ? `${s.revenuePct}% ของรายได้` : s.kind === 'fixed' ? `แบ่งตามสัดส่วน (เต็ม ${s.basePct}%)` : `เกณฑ์ ${fmtMoney(s.threshold)}`);
  const histShown = showAllHistory ? history : history.slice(0, 12);
  const histPeople = personOrder(sections).concat(...history.map((h) => Object.keys(h.results?.persons || {}))).filter((id, i, a) => a.indexOf(id) === i);

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="คอมก้อนที่ 2 — ค่าเช่า / ร้านค้า" subtitle={`งวด ${MONTH_NAMES[month - 1]} ${year + 543} · ทุกธุรกิจรวมกัน`}>
        {profile.isOwner && <button onClick={() => setEditingCfg(true)} className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 rounded-lg text-sm"><Settings2 className="w-4 h-4" /><span className="hidden sm:inline">ตั้งค่าเรท</span></button>}
        <button onClick={save} disabled={saving || loading || !config} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}</button>
      </PageHeader>
      <div className="p-4 md:p-8 space-y-5 max-w-6xl">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} disabled={saving} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} disabled={saving} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {row && <span className="text-xs text-stone-400">{isExcel ? 'นำเข้าจาก Excel' : `บันทึกล่าสุด ${fmt(row.updatedAt)}`}</span>}
          {!row && !loading && <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">ยังไม่ได้บันทึกงวดนี้</span>}
          {loading && <span className="text-xs text-stone-400">กำลังโหลด...</span>}
        </div>

        {/* ที่มาข้อมูล */}
        <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="text-sm text-stone-800 flex items-center gap-1.5 flex-wrap">
            <ClipboardList className="w-4 h-4 text-sky-700" />
            <span>ข้อมูลจาก <b>{form?.name || 'ฟอร์มผู้เช่า'}</b>{assignee ? ` · ${assignee} กรอก` : ''}</span>
            {!sub ? <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">ยังไม่ส่ง</span>
              : isSubmitted(sub) ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">ส่งแล้ว {fmt(sub.submittedAt)}{editedAfterSubmit(sub) ? ' · แก้หลังส่ง' : ''}</span>
              : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">ร่าง (ยังไม่กดส่ง)</span>}
          </div>
          {onOpenForms && <button onClick={onOpenForms} className="text-xs px-2.5 py-1.5 bg-white hover:bg-stone-50 border border-stone-200 rounded-md text-sky-800">ดู/กรอกข้อมูลที่หน้า "ส่งข้อมูล" →</button>}
        </div>

        {isExcel && (
          <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-xs text-violet-900">
            งวดนี้ <b>นำเข้าจาก Excel</b> — คอลัมน์ "Excel" คือยอดที่จ่ายจริง (ใช้ในหน้าคอม) · คอลัมน์อื่นคือการคำนวณใหม่ด้วยเรท/เกณฑ์ปัจจุบันไว้เทียบ (เดือนเก่าเกณฑ์ยังไม่ ×1.1 จึงอาจไม่ตรง)
          </div>
        )}
        {changed.length > 0 && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>ข้อมูลเปลี่ยนหลังบันทึก — ยอดของ {changed.map(nameOf).join(', ')} ไม่ตรงกับที่บันทึกไว้ · กด <b>บันทึก</b> อีกครั้งเพื่อให้หน้าคอมใช้ยอดใหม่</span>
          </div>
        )}

        {/* ยอดที่เจ้าของใส่เอง + คอมพิเศษ */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-4">
          {fixedSections.map((s) => (
            <div key={s.key} className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-end">
              <label className="block">
                <span className="text-sm font-medium text-stone-700">{s.name} (บาท)</span>
                <MoneyInput value={inputs[s.key] ?? ''} onChange={(v) => setInputs((p) => ({ ...p, [s.key]: v }))} placeholder="ใส่ยอดของเดือนนี้" className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
              </label>
              <p className="text-xs text-stone-500 pb-2">ใส่เองทุกเดือน · แบ่งตามสัดส่วนเรท (รวม {s.basePct}%)</p>
            </div>
          ))}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-medium text-stone-700 flex items-center gap-1.5"><Gift className="w-4 h-4 text-rose-500" />คอมพิเศษ (เช่น ห้องใหญ่ค่าเช่าสูงเข้า)</span>
              <button onClick={() => setBonuses((b) => [...b, { empId: '', amount: '', note: '' }])} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่ม</button>
            </div>
            {bonuses.length === 0 && <p className="text-xs text-stone-400">ไม่มีเดือนนี้</p>}
            <div className="space-y-2">
              {bonuses.map((b, i) => (
                <div key={i} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <select value={b.empId} onChange={(e) => setBonus(i, { empId: e.target.value })} className="w-full sm:w-40 px-2 py-1.5 border border-stone-300 rounded-lg text-sm bg-white">
                    <option value="">— เลือกคน —</option>
                    {b.empId && !employees.some((e) => e.id === b.empId && (e.status || 'active') === 'active') && <option value={b.empId}>{nameOf(b.empId)}</option>}
                    {employees.filter((e) => (e.status || 'active') === 'active').map((e) => <option key={e.id} value={e.id}>{dispName(e)}</option>)}
                  </select>
                  <MoneyInput value={b.amount ?? ''} onChange={(v) => setBonus(i, { amount: v })} placeholder="จำนวนเงิน" className="w-32 px-2 py-1.5 border border-stone-300 rounded-lg text-sm text-right tabular-nums" />
                  <input value={b.note || ''} onChange={(e) => setBonus(i, { note: e.target.value })} placeholder="หมายเหตุ เช่น ห้อง 301 เข้า" className="flex-1 min-w-0 px-2 py-1.5 border border-stone-300 rounded-lg text-sm" />
                  <button onClick={() => setBonuses((x) => x.filter((_, idx) => idx !== i))} className="p-1.5 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* สรุปรายคน */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h3 className="text-sm font-medium text-stone-800 mb-2">สรุปรายคน{isExcel ? ' (คำนวณด้วยเรทปัจจุบัน เทียบกับ Excel)' : ''}</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead><tr className="text-xs text-stone-500 border-b border-stone-200">
                <th className="text-left py-2 px-2">พนักงาน</th>
                <th className="text-left py-2 px-2">ขึ้นหน้าคอมของ</th>
                <th className="text-right py-2 px-2">Part A<div className="font-normal text-[10px]">รายได้เกินเกณฑ์</div></th>
                <th className="text-right py-2 px-2">Part B<div className="font-normal text-[10px]">ห้องเข้า − ออก</div></th>
                <th className="text-right py-2 px-2">คอมพิเศษ</th>
                <th className="text-right py-2 px-2">รวม</th>
                {isExcel && <th className="text-right py-2 px-2 bg-violet-50">Excel</th>}
              </tr></thead>
              <tbody>
                {people.map((id) => {
                  const p = res.persons[id] || { a: 0, b: 0, bonus: 0, total: 0 };
                  const x = saved?.[id];
                  const e = empById[id];
                  return (
                    <tr key={id} className="border-b border-stone-50">
                      <td className="py-1.5 px-2 whitespace-nowrap">{nameOf(id)}{e && e.status && e.status !== 'active' && <span className="text-[10px] text-stone-400"> (ลาออก)</span>}</td>
                      <td className="py-1.5 px-2 text-xs text-stone-500 whitespace-nowrap">{e ? bizName(e.businessId) : '—'}</td>
                      <td className="py-1.5 px-2 text-right">{money(p.a)}</td>
                      <td className="py-1.5 px-2 text-right">{money(p.b)}</td>
                      <td className="py-1.5 px-2 text-right">{p.bonus ? money(p.bonus, 'text-rose-700') : <span className="text-stone-300">—</span>}</td>
                      <td className="py-1.5 px-2 text-right font-semibold">{money(p.total, 'text-stone-900')}</td>
                      {isExcel && <td className={`py-1.5 px-2 text-right bg-violet-50/60 font-semibold ${x && Math.abs(x.total - p.total) >= 0.005 ? 'text-violet-800' : 'text-stone-500'}`}>{x ? fmtMoney(x.total) : '—'}</td>}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="font-semibold border-t-2 border-stone-200">
                <td className="py-2 px-2" colSpan={2}>รวม</td>
                <td className="py-2 px-2 text-right">{money(res.totals.a)}</td>
                <td className="py-2 px-2 text-right">{money(res.totals.b)}</td>
                <td className="py-2 px-2 text-right">{money(res.totals.bonus)}</td>
                <td className="py-2 px-2 text-right">{money(res.totals.total)} ฿</td>
                {isExcel && <td className="py-2 px-2 text-right bg-violet-50/60">{fmtMoney(row?.results?.totals?.total)}</td>}
              </tr></tfoot>
            </table>
          </div>
        </div>

        {/* รายละเอียดแต่ละส่วน */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-stone-800">รายละเอียดแต่ละส่วน</h3>
          {res.sections.map((s) => {
            const open = openSec === s.key;
            const ins = s.moves.filter((m) => m?.in_room || Number(m?.in_price));
            const outs = s.moves.filter((m) => m?.out_room || Number(m?.out_price));
            return (
              <div key={s.key} className="border border-stone-200 rounded-lg">
                <button onClick={() => setOpenSec(open ? null : s.key)} className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-stone-50 rounded-lg flex-wrap">
                  {open ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
                  <b className="text-sm text-stone-800">{s.name}</b>
                  <span className="text-xs text-stone-500">{s.kind === 'fixed' ? 'ยอดใส่เอง' : 'รายได้'} {s.hasRevenue ? fmtMoney(s.revenue) : <span className="text-amber-700">ยังไม่มี</span>} · {kindLabel(s)}</span>
                  <span className="ml-auto text-xs text-stone-600">A {money(s.baseA)}{s.partB && <> · B {money(s.baseB)}</>} → แจก {money(s.totalA + s.totalB, 'font-semibold text-stone-800')}</span>
                </button>
                {open && (
                  <div className="px-3 pb-3 space-y-3 text-xs">
                    <div className="text-stone-600">
                      {s.kind === 'threshold' && <>Part A: รายได้ {fmtMoney(s.revenue)} − เกณฑ์ {fmtMoney(s.threshold)}{s.thresholdFrom ? ` (ใช้ตั้งแต่ ${periodLabel({ year: Number(s.thresholdFrom.slice(0, 4)), month: Number(s.thresholdFrom.slice(5, 7)) })})` : ''} = <b>{fmtMoney(s.baseA)}</b>{s.revenue < s.threshold && ' (ต่ำกว่าเกณฑ์ คิดเป็น 0)'}</>}
                      {s.kind === 'percent' && <>Part A: รายได้ {fmtMoney(s.revenue)} × {s.revenuePct}% = <b>{fmtMoney(s.baseA)}</b></>}
                      {s.kind === 'fixed' && <>ยอด {fmtMoney(s.baseA)} แบ่งตามสัดส่วน a ÷ {s.basePct}</>}
                      {s.partB && <> · Part B: ห้องเข้า {fmtMoney(s.sumIn)} − ห้องออก {fmtMoney(s.sumOut)} = <b className={s.baseB < 0 ? 'text-red-600' : ''}>{fmtMoney(s.baseB)}</b></>}
                    </div>
                    {s.partB && (ins.length > 0 || outs.length > 0) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded border border-emerald-100 bg-emerald-50/40 p-2"><div className="font-medium text-emerald-800 mb-1 flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />เข้า {ins.length} ห้อง</div>{ins.map((m, i) => <div key={i} className="flex justify-between"><span>{m.in_room || '—'}</span><span className="tabular-nums">{fmtMoney(m.in_price)}</span></div>)}</div>
                        <div className="rounded border border-rose-100 bg-rose-50/40 p-2"><div className="font-medium text-rose-800 mb-1 flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" />ออก {outs.length} ห้อง</div>{outs.map((m, i) => <div key={i} className="flex justify-between"><span>{m.out_room || '—'}</span><span className="tabular-nums">{fmtMoney(m.out_price)}</span></div>)}</div>
                      </div>
                    )}
                    <table className="w-full">
                      <thead><tr className="text-stone-500 border-b border-stone-100"><th className="text-left py-1">คน</th><th className="text-right py-1">% A</th><th className="text-right py-1">A</th>{s.partB && <><th className="text-right py-1">% B</th><th className="text-right py-1">B</th></>}</tr></thead>
                      <tbody>{s.people.map((p) => (
                        <tr key={p.empId} className="border-b border-stone-50"><td className="py-1">{nameOf(p.empId)}</td><td className="py-1 text-right text-stone-500">{p.rateA}</td><td className="py-1 text-right">{money(p.a)}</td>{s.partB && <><td className="py-1 text-right text-stone-500">{p.rateB}</td><td className="py-1 text-right">{money(p.b)}</td></>}</tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <label className="block">
          <span className="text-sm font-medium text-stone-700">หมายเหตุงวดนี้</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1 w-full px-3 py-2 border border-stone-300 rounded-lg resize-none" />
        </label>

        {/* ประวัติ */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2"><h3 className="text-sm font-medium text-stone-800 flex items-center gap-1.5"><History className="w-4 h-4 text-stone-500" />ย้อนหลัง (ยอดรวมรายคนที่บันทึกไว้)</h3><span className="text-[11px] text-stone-400">กดแถวเพื่อเปิดงวดนั้น</span></div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[720px]">
              <thead><tr className="text-stone-500 border-b border-stone-200"><th className="text-left py-1.5 px-2 sticky left-0 bg-white">งวด</th>{histPeople.map((id) => <th key={id} className="text-right py-1.5 px-2 whitespace-nowrap">{nameOf(id)}</th>)}<th className="text-right py-1.5 px-2">รวม</th></tr></thead>
              <tbody>
                {histShown.map((h) => {
                  const cur = h.periodYear === year && h.periodMonth === month;
                  return (
                    <tr key={`${h.periodYear}-${h.periodMonth}`} onClick={() => { setYear(h.periodYear); setMonth(h.periodMonth); }} className={`border-b border-stone-50 cursor-pointer hover:bg-stone-50 ${cur ? 'bg-emerald-50' : ''}`}>
                      <td className={`py-1.5 px-2 whitespace-nowrap sticky left-0 ${cur ? 'bg-emerald-50' : 'bg-white'}`}>{periodLabel({ year: h.periodYear, month: h.periodMonth })}{h.results?.source === 'excel' && <span className="ml-1 text-[10px] px-1 rounded bg-violet-100 text-violet-800">Excel</span>}</td>
                      {histPeople.map((id) => { const t = h.results?.persons?.[id]?.total; return <td key={id} className={`py-1.5 px-2 text-right tabular-nums ${t < 0 ? 'text-red-600' : 'text-stone-700'}`}>{t != null ? fmtMoney(t) : <span className="text-stone-300">—</span>}</td>; })}
                      <td className="py-1.5 px-2 text-right tabular-nums font-semibold">{fmtMoney(h.results?.totals?.total)}</td>
                    </tr>
                  );
                })}
                {!history.length && <tr><td colSpan={histPeople.length + 2} className="text-center text-stone-400 py-4">ยังไม่มีประวัติ</td></tr>}
              </tbody>
            </table>
          </div>
          {history.length > 12 && <button onClick={() => setShowAllHistory((v) => !v)} className="mt-2 text-xs text-sky-700 hover:underline">{showAllHistory ? 'ย่อ' : `ดูทั้งหมด ${history.length} งวด`}</button>}
        </div>
      </div>
      {editingCfg && (
        <Pool2SettingsModal sections={sections} employees={employees} nameOf={nameOf} onClose={() => setEditingCfg(false)}
          onSave={async (next) => { const r = await ops.pool2.saveConfig(next); if (r) { setConfig(r); setEditingCfg(false); } }} />
      )}
    </div>
  );
}

// ---- ตั้งค่าเรทรายส่วน (เจ้าของ) — เพิ่ม/ลด/เปลี่ยน % รายคน, เกณฑ์, ช่วงเวลาที่เรทมีผล (คนลาออก/คนใหม่) ----
// เพิ่ม "ส่วน" ใหม่ต้องเพิ่มช่องในฟอร์มผู้เช่าด้วย จึงยังไม่เปิดให้เพิ่มจากที่นี่
function Pool2SettingsModal({ sections, employees, nameOf, onClose, onSave }) {
  // เกณฑ์แบบเดิม (ตัวเลขเดียว) → แปลงเป็นขั้นแรก "ตั้งแต่แรก" ให้แก้/เพิ่มขั้นได้
  const [list, setList] = useState(() => JSON.parse(JSON.stringify(sections || [])).map((s) => (s.kind === 'threshold' && !(s.thresholds || []).length ? { ...s, thresholds: [{ from: '', value: s.threshold ?? 0 }] } : s)));
  const thisMonth = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const setStep = (i, j, patch) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, thresholds: s.thresholds.map((t, k) => (k === j ? { ...t, ...patch } : t)) } : s)));
  const rmStep = (i, j) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, thresholds: s.thresholds.filter((_, k) => k !== j) } : s)));
  // ปรับเกณฑ์ใหม่: ตั้งต้น = เกณฑ์ล่าสุด × 1.1 ตั้งแต่เดือนนี้ (แก้ได้)
  const addStep = (i) => setList((l) => l.map((s, idx) => {
    if (idx !== i) return s;
    const last = sortSteps(s.thresholds).pop();
    const base = Number(last?.value) || 0;
    return { ...s, thresholds: [...(s.thresholds || []), { from: thisMonth, value: Math.round(base * 1.1 * 100) / 100 }] };
  }));
  const [saving, setSaving] = useState(false);
  const setSec = (i, patch) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const setRate = (i, j, patch) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, rates: s.rates.map((r, k) => (k === j ? { ...r, ...patch } : r)) } : s)));
  const addRate = (i) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, rates: [...(s.rates || []), { empId: '', a: 0, b: 0 }] } : s)));
  const rmRate = (i, j) => setList((l) => l.map((s, idx) => (idx === i ? { ...s, rates: s.rates.filter((_, k) => k !== j) } : s)));
  const activeEmps = employees.filter((e) => (e.status || 'active') === 'active');
  const numIn = 'w-full px-2 py-1 border border-stone-300 rounded text-right text-sm';
  const submit = async () => {
    for (const s of list) {
      const froms = (s.thresholds || []).map((t) => t.from || '');
      if (new Set(froms).size !== froms.length) { alert(`"${s.name}" มีเกณฑ์ที่เริ่มเดือนเดียวกันซ้ำ — แก้ให้ไม่ซ้ำก่อน`); return; }
    }
    const clean = list.map((s) => {
      const steps = sortSteps(s.thresholds).map((t) => ({ from: t.from || '', value: Number(t.value) || 0 }));
      return {
      ...s,
      ...(steps.length ? { thresholds: steps, threshold: steps[steps.length - 1].value } : { threshold: Number(s.threshold) || 0 }),
      ...(s.revenuePct != null ? { revenuePct: Number(s.revenuePct) || 0 } : {}),
      ...(s.basePct != null ? { basePct: Number(s.basePct) || 0 } : {}),
      rates: (s.rates || []).filter((r) => r.empId).map((r) => {
        const o = { empId: r.empId, a: Number(r.a) || 0, b: Number(r.b) || 0 };
        if (r.from) o.from = r.from; if (r.until) o.until = r.until;
        return o;
      }),
      };
    });
    setSaving(true);
    try { await onSave(clean); } finally { setSaving(false); }
  };
  return (
    <Modal title="ตั้งค่าคอมก้อนที่ 2 — เรทแต่ละส่วน" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-xs text-stone-500">เรทมีผลตั้งแต่/ถึงเดือนไหนก็ได้ (เว้นว่าง = ทุกเดือน) — เช่น คนลาออกใส่ "ถึง" เดือนสุดท้าย คนใหม่ใส่ "ตั้งแต่" · แก้แล้วมีผลกับงวดที่ยังไม่บันทึก / งวดที่กดบันทึกใหม่</p>
        {list.map((s, i) => (
          <div key={s.key} className="border border-stone-200 rounded-lg p-3 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input value={s.name || ''} onChange={(e) => setSec(i, { name: e.target.value })} className="flex-1 min-w-[10rem] px-2 py-1 border border-stone-300 rounded text-sm font-medium" />
              <select value={s.kind} onChange={(e) => setSec(i, { kind: e.target.value })} className="px-2 py-1 border border-stone-300 rounded text-sm bg-white">
                {POOL2_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={s.active !== false} onChange={(e) => setSec(i, { active: e.target.checked })} />ใช้งาน</label>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              {s.kind === 'percent' && <label className="flex items-center gap-1">% ของรายได้ <input type="number" value={s.revenuePct ?? 0} onChange={(e) => setSec(i, { revenuePct: e.target.value })} className="w-20 px-2 py-1 border border-stone-300 rounded text-right" /></label>}
              {s.kind === 'fixed' && <label className="flex items-center gap-1">สัดส่วนเต็ม <input type="number" value={s.basePct ?? 0} onChange={(e) => setSec(i, { basePct: e.target.value })} className="w-20 px-2 py-1 border border-stone-300 rounded text-right" /> %</label>}
              {s.kind !== 'fixed' && <label className="flex items-center gap-1"><input type="checkbox" checked={!!s.partB} onChange={(e) => setSec(i, { partB: e.target.checked })} />คิด Part B (ห้องเข้า − ออก)</label>}
            </div>
            {s.kind === 'threshold' && (
              <div className="rounded-md bg-stone-50 border border-stone-200 p-2 text-xs space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-stone-700">เกณฑ์รายได้ (ปรับขึ้นได้เรื่อยๆ — งวดก่อนหน้ายังใช้เกณฑ์เดิม)</span>
                  <button onClick={() => addStep(i)} className="text-emerald-700 hover:underline flex items-center gap-1 shrink-0"><Plus className="w-3 h-3" />ปรับเกณฑ์ใหม่</button>
                </div>
                {(s.thresholds || []).map((t, j) => (
                  <div key={j} className="flex flex-wrap items-center gap-2">
                    <span className="text-stone-500">ตั้งแต่</span>
                    {t.from || j > 0
                      ? <input type="month" value={t.from || ''} onChange={(e) => setStep(i, j, { from: e.target.value })} className="px-1 py-1 border border-stone-300 rounded bg-white" />
                      : <span className="px-2 py-1 rounded bg-white border border-stone-200 text-stone-600">แรกเริ่ม</span>}
                    <span className="text-stone-500">เกณฑ์</span>
                    <input type="number" value={t.value ?? 0} onChange={(e) => setStep(i, j, { value: e.target.value })} className="w-32 px-2 py-1 border border-stone-300 rounded text-right bg-white" />
                    <span className="text-stone-500">บาท</span>
                    {(s.thresholds || []).length > 1 && <button onClick={() => rmStep(i, j)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                ))}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-xs min-w-[520px]">
                <thead><tr className="text-stone-500"><th className="text-left py-1">คน</th><th className="text-right py-1 w-16">% A</th>{s.partB && <th className="text-right py-1 w-16">% B</th>}<th className="py-1 w-32">ตั้งแต่</th><th className="py-1 w-32">ถึง</th><th className="w-7" /></tr></thead>
                <tbody>
                  {(s.rates || []).map((r, j) => (
                    <tr key={j}>
                      <td className="py-0.5 pr-1">
                        <select value={r.empId} onChange={(e) => setRate(i, j, { empId: e.target.value })} className="w-full px-1 py-1 border border-stone-300 rounded bg-white">
                          <option value="">— เลือก —</option>
                          {r.empId && !activeEmps.some((e) => e.id === r.empId) && <option value={r.empId}>{nameOf(r.empId)} (ลาออก)</option>}
                          {activeEmps.map((e) => <option key={e.id} value={e.id}>{dispName(e)}</option>)}
                        </select>
                      </td>
                      <td className="py-0.5 px-1"><input type="number" step="0.1" value={r.a ?? 0} onChange={(e) => setRate(i, j, { a: e.target.value })} className={numIn} /></td>
                      {s.partB && <td className="py-0.5 px-1"><input type="number" step="0.1" value={r.b ?? 0} onChange={(e) => setRate(i, j, { b: e.target.value })} className={numIn} /></td>}
                      <td className="py-0.5 px-1"><input type="month" value={r.from || ''} onChange={(e) => setRate(i, j, { from: e.target.value })} className="w-full px-1 py-1 border border-stone-300 rounded" /></td>
                      <td className="py-0.5 px-1"><input type="month" value={r.until || ''} onChange={(e) => setRate(i, j, { until: e.target.value })} className="w-full px-1 py-1 border border-stone-300 rounded" /></td>
                      <td><button onClick={() => rmRate(i, j)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-3.5 h-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={() => addRate(i)} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มคน</button>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2 border-t border-stone-100">
          <button onClick={onClose} className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-lg text-sm">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</button>
        </div>
      </div>
    </Modal>
  );
}

export { Pool2Page };
