import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ClipboardList, FileText, Plus, Trash2, Check, Send, ChevronLeft, ChevronRight, ArrowUp, ArrowDown, Pencil, UserCheck, AlertCircle, Table2, CalendarRange, List, DownloadCloud, AlertTriangle } from 'lucide-react';
import { MONTH_NAMES, fmt, fmtMoney } from '../lib/payroll.js';
import { FIELD_TYPES, COLUMN_TYPES, SOURCES, newKey, normalizeFields, isLedgerTable, answerProgress, isSubmitted, editedAfterSubmit, prevPeriod, nextPeriod } from '../lib/dataForms.js';
import { FieldInput } from '../components/DataFormFields.jsx';
import { buildFromFeed, mergePatch, editedFromAuto, autoKeyLabel, ymLabel } from '../lib/propertyFeed.js';
import { Modal, FormField, FormActions, EmptyState, PageHeader } from '../ui/index.jsx';

// คนที่ไม่ใช่เจ้าของโหลด profiles มาแค่ของตัวเอง → ชื่อคนอื่นหาไม่เจอเป็นเรื่องปกติ
const profileName = (profiles, id) => (profiles || []).find((p) => p.id === id)?.name || (id ? 'ผู้ใช้อื่น' : 'ยังไม่มอบหมาย');
const bizName = (businesses, id) => (id ? (businesses.find((b) => b.id === id)?.name || '—') : 'ทุกธุรกิจ');

// ============ หน้า "ส่งข้อมูล" — ผู้ถูกมอบหมายกรอกข้อมูลประจำเดือน (เจ้าของเห็นทุกฟอร์ม กรอกแทนได้) ============
function MyFormsPage({ forms, profile, profiles, businesses, ops }) {
  const now = new Date();
  const myForms = useMemo(() => (forms || []).filter((f) => f.active !== false && (profile.isOwner || f.assigneeUserId === profile.id)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [forms, profile]);
  const [formId, setFormId] = useState(null);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [sub, setSub] = useState(null);       // แถว submission ของงวดนี้ (null = ยังไม่มี)
  const [prevSub, setPrevSub] = useState(null);
  const [answers, setAnswers] = useState({});
  const [note, setNote] = useState('');
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // ตารางแบบ Excel (ledger): ค่าของทุกเดือนในปีนี้ { [month]: answers } + สถานะ · มุมมอง 'year' (ทั้งปี) / 'month' (รายการเป็นแถว) — มือถือเริ่มที่ 'month'
  const [yearSubs, setYearSubs] = useState({});
  const [yearEdits, setYearEdits] = useState({});   // { [month]: answers } ที่แก้ในตารางทั้งปี สำหรับเดือนอื่นที่ไม่ใช่เดือนที่เลือก (ยังไม่บันทึก)
  const [yearReload, setYearReload] = useState(0);
  const [ledgerView, setLedgerView] = useState(() => (typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches ? 'year' : 'month'));

  const form = myForms.find((f) => f.id === formId) || myForms[0] || null;
  const fields = useMemo(() => normalizeFields(form?.fields), [form]);
  const hasLedger = fields.some(isLedgerTable);
  useEffect(() => { if (form && form.id !== formId) setFormId(form.id); }, [form, formId]);

  // ค่าของเดือนอื่นในปี (เฉพาะฟอร์มที่มีตารางแบบ Excel) — โหลดใหม่เมื่อเปลี่ยนฟอร์ม/ปี และหลังบันทึก (sub เปลี่ยน)
  useEffect(() => {
    if (!form || !hasLedger) { setYearSubs({}); return; }
    let cancelled = false;
    (async () => {
      const rows = await ops.dataSubmission.listByForm(form.id, year);
      if (cancelled) return;
      const m = {}; rows.forEach((s) => { m[s.periodMonth] = s; });
      setYearSubs(m); setYearEdits({});
    })();
    return () => { cancelled = true; };
  }, [form?.id, year, hasLedger, sub?.updatedAt, yearReload]);
  // ค่าของเดือนอื่นที่โชว์ในตารางทั้งปี = ที่บันทึกไว้ ทับด้วยที่กำลังแก้
  const yearAnswersFor = (key) => { const o = {}; Object.entries(yearSubs).forEach(([m, s]) => { o[Number(m)] = s?.answers?.[key]; }); Object.entries(yearEdits).forEach(([m, a]) => { o[Number(m)] = a?.[key]; }); return o; };
  const setMonthAnswer = (m, key, v) => setYearEdits((prev) => ({ ...prev, [m]: { ...(prev[m] || yearSubs[m]?.answers || {}), [key]: v } }));
  const editedMonths = Object.keys(yearEdits).map(Number);
  const anyDirty = dirty || editedMonths.length > 0;
  const yearStatus = useMemo(() => { const o = {}; Object.entries(yearSubs).forEach(([m, s]) => { o[Number(m)] = s?.status; }); return o; }, [yearSubs]);

  useEffect(() => {
    if (!form) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const pp = prevPeriod(year, month);
      const [cur, prev] = await Promise.all([ops.dataSubmission.get(form.id, year, month), ops.dataSubmission.get(form.id, pp.year, pp.month)]);
      if (cancelled) return;
      setSub(cur); setPrevSub(prev);
      setAnswers(cur?.answers && typeof cur.answers === 'object' ? cur.answers : {});
      setNote(cur?.note || '');
      setDirty(false); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [form?.id, year, month]);

  // งวด/ฟอร์มที่เปิดอยู่ตอนนี้ — ผลดึงข้อมูลที่กลับมาช้าหลังเปลี่ยนเดือน/ฟอร์ม จะไม่ถูกใส่ผิดงวด
  const currentKeyRef = useRef('');
  currentKeyRef.current = form ? `${form.id}@${year}-${month}` : '';
  const setAnswer = (key, v) => { setAnswers((a) => ({ ...a, [key]: v })); setDirty(true); };
  const progress = useMemo(() => answerProgress(fields, answers), [fields, answers]);
  const submitted = isSubmitted(sub);
  const edited = editedAfterSubmit(sub);

  const persist = async (status) => {
    if (!form) return;
    if (status === 'submitted' && progress.missingRequired.length) { alert(`กรุณากรอกช่องที่จำเป็นก่อนส่ง: ${progress.missingRequired.join(', ')}`); return; }
    setSaving(true);
    const nowISO = new Date().toISOString();
    const payload = {
      formId: form.id, periodYear: year, periodMonth: month, answers, note: note.trim() || null,
      status: status === 'submitted' ? 'submitted' : (submitted ? 'submitted' : 'draft'),
      updatedAt: nowISO,
    };
    if (status === 'submitted') { payload.submittedBy = profile.id; payload.submittedAt = nowISO; }
    const saved = await ops.dataSubmission.upsert(payload);
    // เดือนอื่นที่แก้ในตารางทั้งปี → บันทึกเป็นของเดือนนั้น · กด "ส่ง" = ทุกเดือนที่แก้ถือว่าส่งด้วย (ผู้จัดการหยอดเสร็จแล้วกดส่งทีเดียว) · "บันทึก" = คงสถานะเดิม
    const failedMonths = [];
    for (const m of editedMonths) {
      if (m === month) continue; // เดือนที่เลือกบันทึกไปแล้วด้านบน
      const existing = yearSubs[m];
      const p2 = { formId: form.id, periodYear: year, periodMonth: m, answers: yearEdits[m], status: status === 'submitted' || existing?.status === 'submitted' ? 'submitted' : 'draft', updatedAt: nowISO };
      if (status === 'submitted') { p2.submittedBy = profile.id; p2.submittedAt = nowISO; }
      const ok = await ops.dataSubmission.upsert(p2);
      if (!ok) failedMonths.push(m);
    }
    setSaving(false);
    if (!saved) return;
    setSub(saved); setDirty(false);
    if (failedMonths.length) { alert(`บันทึกเดือน ${failedMonths.map((m) => MONTH_NAMES[m - 1]).join(', ')} ไม่สำเร็จ — ลองใหม่อีกครั้ง`); setYearEdits((prev) => Object.fromEntries(Object.entries(prev).filter(([m]) => failedMonths.includes(Number(m))))); }
    else setYearEdits({});
    setYearReload((n) => n + 1);
    if (status === 'submitted') alert(`ส่งข้อมูล "${form.name}" งวด ${MONTH_NAMES[month - 1]} ${year + 543} เรียบร้อย${editedMonths.length && !failedMonths.length ? ` (ส่งเดือนอื่นที่แก้ไว้ด้วย ${editedMonths.length} เดือน)` : ''}`);
  };

  const changePeriod = (p) => {
    if (anyDirty && !window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก — เปลี่ยนเดือนโดยไม่บันทึก?')) return;
    setYearEdits({}); setYear(p.year); setMonth(p.month);
  };
  const changeForm = (id) => {
    if (anyDirty && !window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก — เปลี่ยนฟอร์มโดยไม่บันทึก?')) return;
    setYearEdits({}); setFormId(id);
  };

  if (!myForms.length) return (
    <div className="h-full overflow-auto"><PageHeader title="ส่งข้อมูล" /><div className="p-4 md:p-8"><EmptyState icon={ClipboardList} title="ยังไม่มีแบบฟอร์มที่มอบหมายให้คุณ" description="เมื่อเจ้าของระบบมอบหมายแบบฟอร์มให้ จะแสดงที่นี่" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ส่งข้อมูล" subtitle={form ? `${form.name} — งวด ${MONTH_NAMES[month - 1]} ${year + 543}` : ''}>
        <div className="flex gap-2">
          <button onClick={() => persist('draft')} disabled={saving || loading || !form} className="flex items-center gap-2 px-3 py-2 bg-white hover:bg-stone-50 border border-stone-300 disabled:opacity-50 text-stone-700 rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{editedMonths.length ? `บันทึก (${editedMonths.length + 1} เดือน)` : submitted ? 'บันทึกการแก้ไข' : 'บันทึกร่าง'}</button>
          <button onClick={() => persist('submitted')} disabled={saving || loading || !form} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Send className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : (submitted ? 'ส่งอีกครั้ง' : 'ส่งข้อมูล')}</button>
        </div>
      </PageHeader>
      <div className={`p-4 md:p-6 space-y-4 ${hasLedger ? 'max-w-[1600px]' : 'max-w-4xl'}`}>
        {myForms.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {myForms.map((f) => (
              <button key={f.id} onClick={() => changeForm(f.id)} className={`px-3 py-1.5 rounded-lg text-sm border ${form?.id === f.id ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}>{f.name}</button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => changePeriod(prevPeriod(year, month))} className="p-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50" aria-label="เดือนก่อน"><ChevronLeft className="w-4 h-4" /></button>
          <select value={month} onChange={(e) => changePeriod({ year, month: Number(e.target.value) })} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => changePeriod({ year: Number(e.target.value), month })} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {[now.getFullYear() + 1, now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2].map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <button onClick={() => changePeriod(nextPeriod(year, month))} className="p-2 rounded-lg border border-stone-300 bg-white hover:bg-stone-50" aria-label="เดือนถัดไป"><ChevronRight className="w-4 h-4" /></button>
          {loading ? <span className="text-xs text-stone-400">กำลังโหลด...</span> : (
            <span className={`text-xs px-2 py-1 rounded-full ${submitted ? 'bg-emerald-100 text-emerald-800' : sub ? 'bg-amber-100 text-amber-800' : 'bg-stone-100 text-stone-500'}`}>
              {submitted ? `ส่งแล้ว ${fmt(sub.submittedAt)}${sub.submittedBy && sub.submittedBy !== profile.id ? ` โดย ${profileName(profiles, sub.submittedBy)}` : ''}${edited ? ' · แก้ไขหลังส่ง' : ''}` : sub ? `ร่าง (บันทึก ${fmt(sub.updatedAt)})` : 'ยังไม่ได้กรอก'}
            </span>
          )}
          {anyDirty && <span className="text-xs text-amber-700">ยังไม่ได้บันทึก{editedMonths.length ? ` (แก้เดือนอื่นด้วย: ${editedMonths.sort((a, b) => a - b).map((m) => MONTH_NAMES[m - 1]).join(', ')})` : ''}</span>}
        </div>

        {form && (
          <div className="bg-white border border-stone-200 rounded-xl p-4 md:p-5 space-y-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h3 className="font-medium text-stone-800">{form.name}</h3>
                {form.description && <p className="text-sm text-stone-500 mt-0.5">{form.description}</p>}
                <p className="text-xs text-stone-400 mt-1">{bizName(businesses, form.businessId)} · ผู้กรอก: {profileName(profiles, form.assigneeUserId)}</p>
              </div>
              <span className="text-xs text-stone-500">กรอกแล้ว {progress.filled}/{progress.total} ช่อง</span>
            </div>
            {!fields.length && <p className="text-sm text-stone-400">ฟอร์มนี้ยังไม่มีช่องให้กรอก — แจ้งเจ้าของระบบ</p>}
            {form.source === 'maruay-property' && form.key === 'tenant_rent' && (
              <PropertyFeedPanel year={year} month={month} answers={answers} disabled={saving || loading} ops={ops}
                periodKey={`${form.id}@${year}-${month}`} currentKey={currentKeyRef}
                onApply={(fn) => { setAnswers((cur) => fn(cur)); setDirty(true); }} />
            )}
            {hasLedger && (
              <div className="flex items-center gap-1 text-xs">
                <span className="text-stone-500 mr-1">มุมมองตาราง:</span>
                <button type="button" onClick={() => setLedgerView('year')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${ledgerView === 'year' ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}><CalendarRange className="w-3.5 h-3.5" />ทั้งปี (แบบ Excel)</button>
                <button type="button" onClick={() => setLedgerView('month')} className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border ${ledgerView === 'month' ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white text-stone-700 border-stone-300 hover:bg-stone-50'}`}><List className="w-3.5 h-3.5" />เฉพาะเดือนนี้</button>
                {ledgerView === 'year' && <span className="text-stone-400 ml-1">หยอดลงเดือนไหนก็ได้ (บิลมาช้า/เร็วไม่เท่ากัน) กด "บันทึก" ทีเดียว · แถวสีเหลือง = เดือนที่เลือก (สถานะ/ปุ่มส่งเป็นของเดือนนั้น) กดชื่อเดือนเพื่อเปลี่ยน</span>}
              </div>
            )}
            {fields.map((f) => (
              <FieldInput key={f.key} field={f} value={answers[f.key]} prevValue={prevSub?.answers?.[f.key]} onChange={(v) => setAnswer(f.key, v)} disabled={saving}
                period={{ year, month }} ledgerView={ledgerView} yearAnswers={isLedgerTable(f) ? yearAnswersFor(f.key) : undefined} yearStatus={yearStatus} onPickMonth={(m) => changePeriod({ year, month: m })} onChangeMonth={(m, v) => setMonthAnswer(m, f.key, v)} />
            ))}
            <FormField label="หมายเหตุถึงผู้คิดคอม">
              <textarea rows={2} value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} disabled={saving} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm resize-y" placeholder="ถ้ามี" />
            </FormField>
            <p className="text-xs text-stone-400">ตัวเลขจางๆ ในช่อง = ค่าของเดือนก่อน (ดูเทียบได้ ไม่ได้ถูกนำมาใช้) · "บันทึกร่าง" เก็บไว้ก่อน · "ส่งข้อมูล" แจ้งว่าพร้อมให้คิดคอมได้แล้ว</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- ดึงข้อมูลจาก maruay-property มาใส่ฟอร์มผู้เช่า (เป็นร่าง — ผู้จัดการตรวจแล้วกดส่งเอง) ----
function PropertyFeedPanel({ year, month, answers, disabled, ops, onApply, periodKey, currentKey }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { report, warnings } ของการดึงครั้งล่าสุดในหน้านี้
  const [error, setError] = useState('');
  useEffect(() => { setResult(null); setError(''); }, [year, month]);
  const auto = answers?.p2_auto;
  const edited = useMemo(() => editedFromAuto(answers), [answers]);
  const billing = ymLabel(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}`);

  const run = async () => {
    setBusy(true); setError('');
    const startedFor = periodKey;
    try {
      const res = await ops.propertyFeed(year, month);
      if (currentKey.current !== startedFor) return; // ผู้ใช้เปลี่ยนเดือน/ฟอร์มระหว่างรอ → ทิ้งผล
      if (res.error) { setError(res.error); return; }
      if (!res.feed) { setError('ไม่ได้รับข้อมูลจาก maruay-property'); return; }
      const built = buildFromFeed(res.feed);
      // ช่องที่มีค่าอยู่แล้วและจะถูกแทน → ถามก่อน
      const filled = Object.keys(built.patch).filter((k) => {
        const v = answers?.[k];
        if (v == null || v === '') return false;
        if (Array.isArray(v)) return v.some((r) => r && Object.values(r).some((x) => String(x ?? '').trim()));
        if (typeof v === 'object') return Object.values(v).some((r) => r && typeof r === 'object' ? Object.values(r).some((x) => String(x ?? '').trim()) : String(r ?? '').trim());
        return true;
      });
      if (filled.length && !window.confirm(`ฟอร์มนี้มีข้อมูลกรอกไว้แล้ว — แทนด้วยข้อมูลจาก maruay-property?\n(ช่องที่ระบบไม่ได้ดึง เช่น ละลายทรัพย์ / หมายเหตุ ยังอยู่เหมือนเดิม)`)) return;
      if (currentKey.current !== startedFor) return;
      const auto = { fetchedAt: res.feed.generatedAt || new Date().toISOString(), billingPeriod: res.feed.billingPeriod, values: built.snapshot };
      // merge กับค่าล่าสุด (ไม่ทับสิ่งที่พิมพ์ระหว่างรอ ในช่องที่ระบบไม่ได้ดึง)
      onApply((cur) => ({ ...mergePatch(cur, built.patch), p2_auto: auto }));
      setResult(built);
    } catch (e) {
      setError('ดึงข้อมูลไม่สำเร็จ: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  const money = (n) => (n == null ? '—' : fmtMoney(n));
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/60 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-sky-900">
          <b>ดึงข้อมูลจาก maruay-property</b>
          <span className="text-xs text-stone-500"> · ค่าเช่า/ห้องเข้า-ออก/น้ำไฟ จากบิลรอบ {billing} · แบกะดินจากแผงรายวันเดือนนี้</span>
        </div>
        <button type="button" onClick={run} disabled={busy || disabled} className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><DownloadCloud className="w-4 h-4" />{busy ? 'กำลังดึง...' : auto ? 'ดึงใหม่' : 'ดึงข้อมูลงวดนี้'}</button>
      </div>
      {auto && !result && <p className="text-xs text-stone-600">ดึงล่าสุด {fmt(auto.fetchedAt)} (บิลรอบ {ymLabel(auto.billingPeriod)})</p>}
      {edited.length > 0 && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">แก้ต่างจากระบบ {edited.length} ส่วน: {edited.map(autoKeyLabel).join(', ')}</p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      {result && (
        <div className="space-y-2">
          <p className="text-xs text-emerald-800">ใส่ลงฟอร์มด้านล่างแล้ว (ยังไม่บันทึก) — ตรวจ แก้ถ้าจำเป็น แล้วกด "ส่งข้อมูล"</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs bg-white rounded border border-sky-100">
              <thead className="text-stone-500"><tr><th className="text-left px-2 py-1">ส่วน</th><th className="text-right px-2 py-1">ค่าเช่า</th><th className="text-left px-2 py-1">ห้องเข้า</th><th className="text-left px-2 py-1">ห้องออก</th><th className="text-left px-2 py-1">ไม่นับ (ต่อสัญญา)</th></tr></thead>
              <tbody className="divide-y divide-stone-100">
                {result.report.sections.map((sec) => (
                  <tr key={sec.key} className={sec.blocked ? 'bg-amber-50' : ''}>
                    <td className="px-2 py-1 whitespace-nowrap">{sec.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{sec.blocked ? (sec.key === 'bkd' ? 'รอสิ้นเดือน' : 'รอออกบิล') : money(sec.revenue)}</td>
                    <td className="px-2 py-1">{sec.ins.map((m) => `${m.unit} (${fmtMoney(m.rent)})`).join(', ') || <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-1">{sec.outs.map((m) => `${m.unit} (${fmtMoney(m.rent)})`).join(', ') || <span className="text-stone-300">—</span>}</td>
                    <td className="px-2 py-1 text-stone-400">{[...new Set(sec.renewals.map((m) => m.unit))].join(', ') || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.warnings.length > 0 && (
            <ul className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-1.5 space-y-0.5">
              {result.warnings.map((w, i) => <li key={i} className="flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />{w}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ============ หน้า "แบบฟอร์มข้อมูล" — เจ้าของสร้างฟอร์ม / กำหนดช่อง / มอบหมายผู้กรอก ============
function DataFormsAdminPage({ forms, profiles, businesses, ops }) {
  const [editing, setEditing] = useState(null); // null | { ...form } (id ว่าง = สร้างใหม่)
  const sorted = useMemo(() => [...(forms || [])].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''))), [forms]);
  const assignable = useMemo(() => (profiles || []).filter((p) => p.role && p.role !== 'pending'), [profiles]);

  const blank = () => ({ id: null, key: newKey('form'), name: '', description: '', businessId: '', assigneeUserId: '', source: 'manual', active: true, sortOrder: (sorted.length + 1), fields: [] });
  const remove = async (f) => {
    if (!window.confirm(`ลบแบบฟอร์ม "${f.name}"? ข้อมูลที่เคยส่งมาทุกเดือนของฟอร์มนี้จะถูกลบไปด้วย`)) return;
    await ops.dataForm.delete(f.id);
  };
  const toggleActive = (f) => ops.dataForm.update(f.id, { active: !(f.active !== false) });

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="แบบฟอร์มข้อมูล" subtitle="ฟอร์มที่ให้ผู้จัดการกรอกทุกเดือน เพื่อนำไปประกอบการคิดคอมมิชชั่น">
        <button onClick={() => setEditing(blank())} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />สร้างแบบฟอร์ม</button>
      </PageHeader>
      <div className="p-4 md:p-6 space-y-3 max-w-4xl">
        <p className="text-sm text-stone-500">ใครถูกมอบหมาย จะเห็นเมนู "ส่งข้อมูล" ตามบัญชีผู้ใช้ของตัวเอง — เปลี่ยนคนกรอกได้ที่นี่โดยไม่ต้องแก้ฟอร์ม · ข้อมูลที่ส่งมาจะไปโชว์ในหน้าคอมมิชชั่นของงวดนั้น</p>
        {!sorted.length && <EmptyState icon={FileText} title="ยังไม่มีแบบฟอร์ม" description="สร้างแบบฟอร์มแรก เช่น ค่าน้ำ-ค่าไฟประจำเดือน" action={<button onClick={() => setEditing(blank())} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm">สร้างแบบฟอร์ม</button>} />}
        {sorted.map((f) => {
          const fs = normalizeFields(f.fields);
          return (
            <div key={f.id} className={`bg-white border rounded-xl p-4 ${f.active === false ? 'border-stone-200 opacity-60' : 'border-stone-200'}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-medium text-stone-800">{f.name}</h3>
                    {f.active === false && <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">ปิดใช้</span>}
                    {f.source === 'maruay-property' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700">maruay-property</span>}
                  </div>
                  {f.description && <p className="text-sm text-stone-500 mt-0.5">{f.description}</p>}
                  <p className="text-xs text-stone-500 mt-1.5 flex items-center gap-1 flex-wrap"><UserCheck className="w-3.5 h-3.5 text-emerald-700" />ผู้กรอก: <b className={f.assigneeUserId ? 'text-stone-700' : 'text-amber-700'}>{profileName(profiles, f.assigneeUserId)}</b> · {bizName(businesses, f.businessId)} · {fs.length} ช่อง{fs.some((x) => x.type === 'table') ? ` (ตาราง ${fs.filter((x) => x.type === 'table').length})` : ''}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setEditing({ ...f, businessId: f.businessId || '', assigneeUserId: f.assigneeUserId || '', description: f.description || '', fields: fs })} className="flex items-center gap-1 px-2.5 py-1.5 text-sm text-stone-700 hover:bg-stone-100 rounded-lg"><Pencil className="w-3.5 h-3.5" />แก้ไข</button>
                  <button onClick={() => toggleActive(f)} className="px-2.5 py-1.5 text-sm text-stone-600 hover:bg-stone-100 rounded-lg">{f.active === false ? 'เปิดใช้' : 'ปิดใช้'}</button>
                  <button onClick={() => remove(f)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="ลบ"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {editing && <FormEditorModal form={editing} profiles={assignable} businesses={businesses} ops={ops} onClose={() => setEditing(null)} />}
    </div>
  );
}

// ---- โมดัลแก้ฟอร์ม + ตัวแก้ช่อง ----
function FormEditorModal({ form, profiles, businesses, ops, onClose }) {
  const [f, setF] = useState(form);
  const [saving, setSaving] = useState(false);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const setField = (i, patch) => set({ fields: f.fields.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) });
  const addField = (type) => set({ fields: [...f.fields, { key: newKey(), label: '', type, unit: '', hint: '', required: false, ...(type === 'table' ? { columns: [{ key: newKey('c'), label: '', type: 'number' }], rows: [] } : {}) }] });
  const rmField = (i) => set({ fields: f.fields.filter((_, idx) => idx !== i) });
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= f.fields.length) return;
    const arr = [...f.fields]; [arr[i], arr[j]] = [arr[j], arr[i]]; set({ fields: arr });
  };

  const save = async () => {
    const name = (f.name || '').trim();
    if (!name) { alert('กรุณาใส่ชื่อแบบฟอร์ม'); return; }
    const fields = normalizeFields(f.fields).map((x) => ({ ...x, label: (x.label || '').trim() }));
    const noLabel = fields.filter((x) => !x.label);
    if (noLabel.length) { alert('มีช่องที่ยังไม่ได้ตั้งชื่อ — ใส่ชื่อหรือลบช่องนั้นก่อน'); return; }
    const badTable = fields.find((x) => x.type === 'table' && (!x.columns.length || x.columns.some((c) => !(c.label || '').trim()) || x.rows.some((r) => !(r.label || '').trim())));
    if (badTable) { alert(`ตาราง "${badTable.label}" ต้องมีอย่างน้อย 1 คอลัมน์ และคอลัมน์/แถวทุกอันต้องมีชื่อ`); return; }
    setSaving(true);
    const payload = {
      key: f.key, name, description: (f.description || '').trim() || null,
      businessId: f.businessId || null, assigneeUserId: f.assigneeUserId || null,
      source: f.source || 'manual', active: f.active !== false, sortOrder: Number(f.sortOrder) || 0, fields,
      updatedAt: new Date().toISOString(),
    };
    const ok = f.id ? await ops.dataForm.update(f.id, payload) : await ops.dataForm.add(payload);
    setSaving(false);
    if (ok) onClose();
  };

  const inputCls = 'w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
  const smallCls = 'px-2 py-1.5 border border-stone-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/40';
  return (
    <Modal title={f.id ? 'แก้ไขแบบฟอร์ม' : 'สร้างแบบฟอร์ม'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormField label="ชื่อแบบฟอร์ม" required><input value={f.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} placeholder="เช่น ค่าน้ำ-ค่าไฟ ประจำเดือน" /></FormField>
          <FormField label="ผู้กรอก (มอบหมายตามบัญชีผู้ใช้)">
            <select value={f.assigneeUserId} onChange={(e) => set({ assigneeUserId: e.target.value })} className={inputCls}>
              <option value="">— ยังไม่มอบหมาย —</option>
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.name || p.id}</option>)}
            </select>
          </FormField>
          <FormField label="ธุรกิจที่เกี่ยวข้อง">
            <select value={f.businessId} onChange={(e) => set({ businessId: e.target.value })} className={inputCls}>
              <option value="">ทุกธุรกิจ / ส่วนกลาง</option>
              {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </FormField>
          <FormField label="ที่มาของข้อมูล">
            <select value={f.source || 'manual'} onChange={(e) => set({ source: e.target.value })} className={inputCls}>
              {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </FormField>
        </div>
        <FormField label="คำอธิบาย (โชว์ให้ผู้กรอกเห็น)"><textarea rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} className={`${inputCls} resize-y`} /></FormField>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.active !== false} onChange={(e) => set({ active: e.target.checked })} className="w-4 h-4 accent-emerald-700" />เปิดใช้งาน</label>
          <label className="flex items-center gap-2">ลำดับ <input type="number" value={f.sortOrder ?? 0} onChange={(e) => set({ sortOrder: e.target.value })} className={`${smallCls} w-16 text-right`} /></label>
        </div>

        <div className="border-t border-stone-200 pt-3">
          <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
            <h4 className="text-sm font-medium text-stone-700">ช่องที่ให้กรอก ({f.fields.length})</h4>
            <div className="flex flex-wrap gap-1">
              {FIELD_TYPES.map((t) => <button key={t.value} type="button" onClick={() => addField(t.value)} className="flex items-center gap-1 px-2 py-1 text-xs bg-stone-100 hover:bg-stone-200 rounded-md text-stone-700">{t.value === 'table' ? <Table2 className="w-3 h-3" /> : <Plus className="w-3 h-3" />}{t.label}</button>)}
            </div>
          </div>
          {!f.fields.length && <p className="text-xs text-stone-400 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />ยังไม่มีช่อง — กดปุ่มด้านบนเพื่อเพิ่ม (ตัวเลข / ข้อความ / ตาราง)</p>}
          <div className="space-y-2">
            {f.fields.map((x, i) => (
              <div key={x.key} className="border border-stone-200 rounded-lg p-3 bg-stone-50/60 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-stone-200 text-stone-500">{FIELD_TYPES.find((t) => t.value === x.type)?.label || x.type}</span>
                  <input value={x.label} onChange={(e) => setField(i, { label: e.target.value })} className={`${smallCls} flex-1 min-w-[10rem] bg-white`} placeholder="ชื่อช่อง เช่น ค่าช้อนส้อม" />
                  {x.type === 'number' && <input value={x.unit || ''} onChange={(e) => setField(i, { unit: e.target.value })} className={`${smallCls} w-20 bg-white`} placeholder="หน่วย" />}
                  <label className="flex items-center gap-1 text-xs text-stone-600"><input type="checkbox" checked={!!x.required} onChange={(e) => setField(i, { required: e.target.checked })} className="accent-emerald-700" />จำเป็น</label>
                  <div className="flex items-center">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="เลื่อนขึ้น"><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === f.fields.length - 1} className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="เลื่อนลง"><ArrowDown className="w-3.5 h-3.5" /></button>
                    <button type="button" onClick={() => rmField(i)} className="p-1 text-red-400 hover:text-red-600" title="ลบช่อง"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <input value={x.hint || ''} onChange={(e) => setField(i, { hint: e.target.value })} className={`${smallCls} w-full bg-white`} placeholder="คำอธิบายใต้ช่อง (ถ้ามี)" />
                {x.type === 'table' && <TableDefEditor field={x} onChange={(patch) => setField(i, patch)} smallCls={smallCls} />}
              </div>
            ))}
          </div>
        </div>
        <FormActions onCancel={onClose} onSubmit={save} submitLabel={saving ? 'กำลังบันทึก...' : 'บันทึกแบบฟอร์ม'} />
      </div>
    </Modal>
  );
}

function TableDefEditor({ field, onChange, smallCls }) {
  const cols = field.columns || [];
  const rows = field.rows || [];
  const setCol = (i, patch) => onChange({ columns: cols.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) });
  const setRow = (i, patch) => onChange({ rows: rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const moveRow = (i, dir) => { const j = i + dir; if (j < 0 || j >= rows.length) return; const arr = [...rows]; [arr[i], arr[j]] = [arr[j], arr[i]]; onChange({ rows: arr }); };
  const dynamic = rows.length === 0;
  const ledger = field.layout === 'ledger';
  return (
    <div className="space-y-3">
      {!dynamic && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-stone-700 bg-white border border-stone-200 rounded-md px-2.5 py-2">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={ledger} onChange={(e) => onChange({ layout: e.target.checked ? 'ledger' : 'list' })} className="accent-emerald-700" />แสดงแบบตารางทั้งปี (เหมือน Excel: เดือนเป็นแถว รายการเป็นคอลัมน์)</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!field.summaryRows} onChange={(e) => onChange({ summaryRows: e.target.checked })} className="accent-emerald-700" />หน้าคอมโชว์ตัวเลขรายแถว + รวมรายกลุ่ม</label>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-stone-600">คอลัมน์ ({cols.length})</span><button type="button" onClick={() => onChange({ columns: [...cols, { key: newKey('c'), label: '', type: 'number' }] })} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มคอลัมน์</button></div>
          <div className="space-y-1">
            {cols.map((c, i) => (
              <div key={c.key} className="flex items-center gap-1">
                <input value={c.label} onChange={(e) => setCol(i, { label: e.target.value })} className={`${smallCls} flex-1 min-w-[6rem] bg-white`} placeholder="ชื่อคอลัมน์" />
                <select value={c.type} onChange={(e) => setCol(i, { type: e.target.value })} className={`${smallCls} bg-white`}>{COLUMN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
                {c.type === 'text' && <input value={c.placeholder || ''} onChange={(e) => setCol(i, { placeholder: e.target.value })} className={`${smallCls} w-28 bg-white`} placeholder="ค่าจาง {month}" title="ข้อความจางในช่อง — ใช้ {month} = ชื่อเดือนที่กรอก, {year} = ปี พ.ศ." />}
                <button type="button" onClick={() => onChange({ columns: cols.filter((_, idx) => idx !== i) })} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-medium text-stone-600">แถว / รายการ ({rows.length})</span><button type="button" onClick={() => onChange({ rows: [...rows, { key: newKey('r'), label: '', sub: '', group: rows[rows.length - 1]?.group || '', hint: '' }] })} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มแถว</button></div>
          {dynamic && <p className="text-[11px] text-stone-400 mb-1">ไม่กำหนดแถว = ผู้กรอกเพิ่มแถวเองได้ (เช่น รายชื่อผู้เช่าที่เข้า-ออก)</p>}
          {!dynamic && <p className="text-[11px] text-stone-400 mb-1">กลุ่ม = หัวข้อรวมแถว (เช่น ค่าไฟ / ค่าน้ำ) · คำอธิบาย = ข้อความใต้ชื่อ (เช่น สถานที่) · หมายเหตุ = โชว์ตอนเอาเมาส์ชี้ (เช่น ที่อยู่)</p>}
          <div className="space-y-1">
            {rows.map((r, i) => (
              <div key={r.key} className="flex items-center gap-1 flex-wrap">
                <input value={r.group || ''} onChange={(e) => setRow(i, { group: e.target.value })} className={`${smallCls} w-20 bg-white`} placeholder="กลุ่ม" list={`df_groups_${field.key}`} />
                <input value={r.label} onChange={(e) => setRow(i, { label: e.target.value })} className={`${smallCls} flex-1 min-w-[6rem] bg-white`} placeholder="ชื่อแถว เช่น เลขบัญชี" />
                <input value={r.sub || ''} onChange={(e) => setRow(i, { sub: e.target.value })} className={`${smallCls} w-28 bg-white`} placeholder="คำอธิบาย" />
                <input value={r.hint || ''} onChange={(e) => setRow(i, { hint: e.target.value })} className={`${smallCls} w-24 bg-white`} placeholder="หมายเหตุ" />
                <button type="button" onClick={() => moveRow(i, -1)} disabled={i === 0} className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="เลื่อนขึ้น"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => moveRow(i, 1)} disabled={i === rows.length - 1} className="p-1 text-stone-400 hover:text-stone-700 disabled:opacity-30" title="เลื่อนลง"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button type="button" onClick={() => onChange({ rows: rows.filter((_, idx) => idx !== i) })} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            ))}
          </div>
          {!dynamic && <datalist id={`df_groups_${field.key}`}>{[...new Set(rows.map((r) => r.group).filter(Boolean))].map((g) => <option key={g} value={g} />)}</datalist>}
        </div>
      </div>
    </div>
  );
}

export { MyFormsPage, DataFormsAdminPage };
