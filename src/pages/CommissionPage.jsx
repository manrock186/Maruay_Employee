import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Users, Plus, Trash2, Banknote, Check, Percent, Upload, ClipboardPaste, ChevronDown, ChevronUp, X, RefreshCw, Layers, AlertCircle, ClipboardList, ArrowRight, AlertTriangle, Pin } from 'lucide-react';
import { dispName, isActive } from '../lib/format.js';
import { NO_DEPT, employeeDepartment } from '../lib/order.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, fmt, holidayBalance } from '../lib/payroll.js';
import { parseLoyverseText, computeCommission } from '../lib/commission.js';
import { normalizeFields, numericSummary, latestNumericSummary, isLedgerTable, isSubmitted, editedAfterSubmit, periodKey, periodLabel } from '../lib/dataForms.js';
import { AnswersView, groupTone } from '../components/DataFormFields.jsx';
import { UtilityPanel } from '../components/UtilityPanel.jsx';
import { computeUtility, utilityFormIds } from '../lib/utility.js';
import { computePool2, pool2Changed, rateActive } from '../lib/pool2.js';
import { FormField, EmptyState, PageHeader } from '../ui/index.jsx';

// ============ COMMISSION PAGE (คอมมิชชั่น) ============
// ก้อนที่ 1 (POS): กองกลาง = กำไร Loyverse − รายการหัก → × % ต่อคน → หักวันหยุดเกินสิทธิ (÷30) → ส่วนที่หายแบ่งในแผนก
// ก้อนที่ 2 (ค่าเช่า/ร้านค้า): คิดที่หน้า "คอมก้อนที่ 2" (ข้ามธุรกิจ) → ยอดรายคนที่บันทึกไว้มาลงช่อง คอม 2 ของคนที่ธุรกิจหลักคือธุรกิจนี้ (กันนับซ้ำคนที่อยู่หลายธุรกิจ)
//   งวดที่ยังไม่ได้บันทึกก้อนที่ 2 → ช่องคอม 2 กรอกเองได้เหมือนเดิม
// ข้อมูลจากผู้จัดการ (แบบฟอร์มข้อมูลประจำเดือน) โชว์ในก้อนที่ 1 — กดใส่ตัวเลขเป็นรายการหักได้เลย ไม่ต้องพิมพ์ซ้ำ
function CommissionPage({ businesses, employees, positions, activeBusinessId, dataForms = [], profiles = [], onOpenPool2, ops }) {
  const [saved2, setSaved2] = useState({}); // empId -> คอม 2 ที่บันทึกไว้ในพูลคอมงวดนี้ (เทียบว่าก้อนที่ 2 เปลี่ยนหลังบันทึกคอมไหม)
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [posProfit, setPosProfit] = useState('');
  const [posItems, setPosItems] = useState([]);      // รายการสินค้าจากไฟล์ Loyverse (เก็บไว้ดูย้อนหลัง)
  const [posImport, setPosImport] = useState(null);  // { fileName, importedAt, rows, net, cost, profit }
  const [showItems, setShowItems] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [deductions, setDeductions] = useState([]);
  const [entries, setEntries] = useState({});
  const [payrollExcess, setPayrollExcess] = useState(null); // empId -> หยุดเกินจากหน้าเงินเดือน (null = ยังไม่โหลด)
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [dedCarried, setDedCarried] = useState(false); // รายการหักถูกดึงมาจากเดือนก่อน (ยังไม่บันทึก)
  const [submissions, setSubmissions] = useState({}); // formId -> ข้อมูลที่ผู้จัดการส่งมาของงวดนี้
  const [formHistory, setFormHistory] = useState({}); // formId -> [{year, month, answers, status}] ทุกเดือนที่โหลด (ฟอร์มตารางแบบ Excel: ใช้ "ยอดล่าสุดที่มี")
  const [usedSources, setUsedSources] = useState({});
  const [utilCfg, setUtilCfg] = useState(null);
  const [fixedDeds, setFixedDeds] = useState([]);       // รายการหักประจำทุกเดือน (commission_settings.fixed_deductions) เช่น ค่าช้อนส้อม        // ตั้งค่าสาธารณูปโภคของธุรกิจนี้ (commission_settings.utility) — ใช้ทุกเดือน // `${srcKey}@${srcPeriod}` -> [{businessId, year, month}] งวดคอมอื่นที่เคยใช้ตัวเลขนี้แล้ว
  const [openForm, setOpenForm] = useState(null);     // formId ที่กางดูรายละเอียด
  const [pool2Row, setPool2Row] = useState(null);     // commission_pool2 ของงวด (ยอดก้อนที่ 2 ที่บันทึกไว้)
  const [pool2Cfg, setPool2Cfg] = useState(null);
  const fileRef = useRef(null);

  const business = businesses.find((b) => b.id === activeBusinessId);
  // + คนที่ลาออกแล้วแต่ยังมีคอมก้อนที่ 2 งวดนี้ (เดือนสุดท้าย) ที่ธุรกิจหลักนี้ — ไม่งั้นยอดเดือนสุดท้ายหาย
  const bizEmployees = useMemo(() => employees.filter((e) => (isActive(e) || (e.businessId === activeBusinessId && Number(pool2Row?.results?.persons?.[e.id]?.total))) && (e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))), [employees, activeBusinessId, pool2Row]);

  // หยุดเกินสิทธิของงวดนี้จากแถวเงินเดือน (ถ้าทำเงินเดือนแล้ว) — ไม่ต้องกรอกซ้ำ
  const loadPayrollExcess = async () => {
    const rows = await ops.payroll.listByPeriod(activeBusinessId, year, month);
    const m = {};
    rows.forEach((p) => { m[p.employeeId] = { excess: Math.max(0, holidayBalance(p).excess), status: p.status, commission: Number(p.commission) || 0 }; });
    return m;
  };

  // ฟอร์มที่เกี่ยวกับธุรกิจนี้ (หรือส่วนกลาง) ที่ยังเปิดใช้ — เรียงตาม sort_order
  const periodForms = useMemo(() => (dataForms || []).filter((f) => f.active !== false && (!f.businessId || f.businessId === activeBusinessId)).sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)), [dataForms, activeBusinessId]);
  const loadSubmissions = async (cfg = utilCfg) => {
    const rows = await ops.dataSubmission.listByPeriod(year, month);
    const m = {}; rows.forEach((s) => { m[s.formId] = s; });
    // ฟอร์มที่มีตารางแบบ Excel + ฟอร์มที่ใช้คิดสาธารณูปโภค → โหลดทุกเดือน ปีก่อน-ปีนี้-ปีหน้า เพื่อหา "ยอดล่าสุดที่มี"
    const utilIds = new Set(utilityFormIds(cfg));
    const ledgerForms = periodForms.filter((f) => utilIds.has(f.id) || normalizeFields(f.fields).some(isLedgerTable));
    const hist = {};
    await Promise.all(ledgerForms.map(async (f) => {
      const list = await ops.dataSubmission.listByFormYears(f.id, [year - 1, year, year + 1]);
      hist[f.id] = list.map((x) => ({ year: x.periodYear, month: x.periodMonth, answers: x.answers, status: x.status, updatedAt: x.updatedAt }));
    }));
    // รายการหักของพูลคอมงวดอื่น (ทุกธุรกิจ) ที่ระบุที่มา (srcKey@srcPeriod) → เตือนตัวเลขที่เคยใช้แล้ว
    const pools = await ops.commission.listDeductionSources();
    const used = {};
    pools.forEach((pl) => {
      if (pl.businessId === activeBusinessId && pl.periodYear === year && pl.periodMonth === month) return; // งวดนี้เอง = "ใส่แล้ว" ไม่ใช่ "เคยใช้"
      (pl.deductions || []).forEach((d) => {
        const add = (k, p) => { if (k && p) (used[`${k}@${p}`] ||= []).push({ businessId: pl.businessId, year: pl.periodYear, month: pl.periodMonth }); };
        add(d.srcKey, d.srcPeriod);
        (d.sources || []).forEach((x) => add(x.srcKey, x.srcPeriod)); // รายการหักอัตโนมัติ (สาธารณูปโภค) เก็บที่มาหลายช่อง
      });
    });
    return { m, hist, used };
  };
  const applySubmissions = (r) => { setSubmissions(r.m); setFormHistory(r.hist); setUsedSources(r.used); };
  const refreshSubmissions = async () => { applySubmissions(await loadSubmissions()); };


  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const settings = await ops.commission.getSettings(activeBusinessId);
      const cfg = settings?.utility && Object.keys(settings.utility).length ? settings.utility : null;
      const [pool, pe, subs, p2row, p2cfg] = await Promise.all([ops.commission.getByPeriod(activeBusinessId, year, month), loadPayrollExcess(), loadSubmissions(cfg), ops.pool2.get(year, month), ops.pool2.getConfig()]);
      if (cancelled) return;
      setPool2Row(p2row); setPool2Cfg(p2cfg);
      setUtilCfg(cfg);
      const fixed = Array.isArray(settings?.fixedDeductions) ? settings.fixedDeductions : [];
      setFixedDeds(fixed);
      const isFixed = (label) => fixed.some((f) => String(f.label || '').trim() === String(label || '').trim());
      // รายการหักอัตโนมัติ (สาธารณูปโภค) คำนวณสดทุกครั้ง ไม่เอาของที่บันทึกไว้มาเป็นแถวแก้มือ
      // + ถ้าเปิดสาธารณูปโภคแล้ว ตัดแถวมือที่มาจากฟอร์มที่ใช้คิดอยู่ (กันหักซ้ำ) และแถวชื่อ "น้ำไฟ…" แบบเก่าจาก Excel
      const utilIds = utilityFormIds(cfg);
      const manualOnly = (list) => (list || []).filter((d) => !d.auto && !(cfg?.enabled && ((d.srcKey && utilIds.some((id) => String(d.srcKey).startsWith(`${id}.`))) || /น้ำไฟ/.test(d.label || ''))));
      setPayrollExcess(pe);
      applySubmissions(subs);
      setOpenForm(null);
      const emFromProfile = () => { const em = {}; bizEmployees.forEach((e) => { if (e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '', excessDays: '' }; }); return em; };
      // พูลที่มีแค่ข้อมูล POS (บันทึกอัตโนมัติตอนนำเข้าไฟล์) ยังไม่นับว่า "บันทึกคอมแล้ว" → รายการหัก/คนยังตั้งต้นแบบเดือนใหม่
      const posOnly = pool && !(pool.entries || []).length && !(pool.deductions || []).length;
      if (pool && !posOnly) {
        setDedCarried(false);
        setPosProfit(pool.posProfit ?? '');
        setPosItems(Array.isArray(pool.posItems) ? pool.posItems : []);
        setPosImport(pool.posImport || null);
        setDeductions(manualOnly(pool.deductions).map((d) => ({ ...d, fixed: isFixed(d.label) })));
        setNote(pool.note || '');
        const em = {};
        const s2 = {}; (pool.entries || []).forEach((e) => { s2[e.employeeId] = Number(e.amount2) || 0; }); setSaved2(s2);
        (pool.entries || []).forEach((e) => { em[e.employeeId] = { pct: e.pct ?? '', amount: e.amount ?? '', pct2: e.pct2 ?? '', amount2: e.amount2 ?? '', excessDays: e.excessDays ?? '' }; });
        // เติม pct ตั้งต้นให้คนที่ยังไม่มี entry
        bizEmployees.forEach((e) => { if (!em[e.id] && e.commissionPct != null) em[e.id] = { pct: e.commissionPct, amount: '', pct2: '', amount2: '', excessDays: '' }; });
        setEntries(em);
        setSavedAt(pool.updatedAt || pool.createdAt || null);
      } else {
        setPosProfit(pool?.posProfit ? pool.posProfit : ''); setPosItems(Array.isArray(pool?.posItems) ? pool.posItems : []); setPosImport(pool?.posImport || null);
        setNote(pool?.note || ''); setSavedAt(null); setSaved2({});
        // เดือนใหม่ที่ยังไม่เคยบันทึก → ดึง "รายการหัก" จากเดือนก่อนหน้ามาตั้งต้น (รายการเหมือนเดิม เปลี่ยนแค่ตัวเลข)
        const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
        const prevPool = await ops.commission.getByPeriod(activeBusinessId, prev.y, prev.m);
        if (cancelled) return;
        // รายการหักประจำ (ช้อนส้อม ฯลฯ) เติมยอดให้เลย กันลืม · รายการอื่นจากเดือนก่อนดึงแค่ชื่อ (ยอดเว้นว่าง)
        const carry = manualOnly(prevPool?.deductions).filter((d) => !isFixed(d.label));
        const next = [
          ...fixed.map((f) => ({ label: f.label || '', amount: f.amount ?? '', fixed: true })),
          ...carry.map((d) => ({ label: d.label || '', amount: '', ...(d.srcKey ? { srcKey: d.srcKey } : {}) })),
        ];
        setDeductions(next); setDedCarried(carry.length > 0 || fixed.length > 0);
        setEntries(emFromProfile());
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  // ---- กำไร POS บันทึกทันที (ไม่ต้องรอกด "บันทึกคอม") — เปลี่ยนหน้า/รีเฟรชแล้วไฟล์ที่นำเข้าและยอดไม่หาย ----
  // upsert เฉพาะคอลัมน์ POS → ถ้ามีพูลของงวดนี้อยู่แล้ว ส่วนอื่น (รายการหัก/คน) ไม่ถูกแตะ
  const [posSavedAt, setPosSavedAt] = useState(null);
  const savePos = async (patch) => {
    const res = await ops.commission.upsert({ businessId: activeBusinessId, periodYear: year, periodMonth: month, ...patch });
    if (res) setPosSavedAt(new Date().toISOString());
  };
  // ---- นำเข้าไฟล์ Loyverse ----
  const applyImport = (text, fileName) => {
    const r = parseLoyverseText(text);
    if (r.error) { alert(r.error); return false; }
    setPosItems(r.items);
    setPosImport({ fileName: fileName || 'วางจาก Excel', importedAt: new Date().toISOString(), rows: r.items.length, qty: r.totals.qty, net: r.totals.net, cost: r.totals.cost, profit: r.totals.profit,
      excluded: (r.excluded || []).map((it) => ({ name: it.name, profit: it.profit })), excludedProfit: r.excludedTotals?.profit || 0 });
    setPosProfit(r.totals.profit);
    setShowItems(false); setPasteOpen(false); setPasteText('');
    savePos({ posProfit: r.totals.profit, posItems: r.items, posImport: { fileName: fileName || 'วางจาก Excel', importedAt: new Date().toISOString(), rows: r.items.length, qty: r.totals.qty, net: r.totals.net, cost: r.totals.cost, profit: r.totals.profit,
      excluded: (r.excluded || []).map((it) => ({ name: it.name, profit: it.profit })), excludedProfit: r.excludedTotals?.profit || 0 } });
    return true;
  };
  const onFile = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { applyImport(await f.text(), f.name); } finally { e.target.value = ''; }
  };
  const clearImport = () => {
    if (!window.confirm('ล้างข้อมูลไฟล์ Loyverse ที่นำเข้าของงวดนี้?')) return;
    setPosItems([]); setPosImport(null); setPosProfit('');
    savePos({ posItems: [], posImport: null, posProfit: 0 });
  };

  // ---- คำนวณ ----
  // สาธารณูปโภค: รายจ่าย (บิลที่เลือก) vs รายรับจากผู้เช่า → รายการหักอัตโนมัติ
  const util = useMemo(() => computeUtility(utilCfg, periodForms, formHistory, { year, month }), [utilCfg, periodForms, formHistory, year, month]);
  const autoDeds = util.deductions;
  const utilFormSet = useMemo(() => new Set(utilCfg?.enabled ? utilityFormIds(utilCfg) : []), [utilCfg]);
  const saveUtilCfg = async (cfg) => {
    const res = await ops.commission.saveSettings(activeBusinessId, { utility: cfg });
    if (!res) return false;
    setUtilCfg(cfg);
    applySubmissions(await loadSubmissions(cfg));
    return true;
  };
  // ปักหมุด/เลิกปักหมุด "หักทุกเดือน" — บันทึกค่าตั้งต้นทันที (ไม่ต้องรอกดบันทึกคอม)
  const saveFixed = async (list) => {
    const clean = list.filter((d) => String(d.label || '').trim()).map((d) => ({ label: String(d.label).trim(), amount: Number(d.amount) || 0 }));
    const res = await ops.commission.saveSettings(activeBusinessId, { fixedDeductions: clean });
    if (res) setFixedDeds(clean);
    return !!res;
  };
  const togglePin = async (i) => {
    const d = deductions[i];
    if (!String(d.label || '').trim()) { alert('ใส่ชื่อรายการก่อน แล้วค่อยปักหมุด'); return; }
    const pinned = !d.fixed;
    const nextDeds = deductions.map((x, idx) => (idx === i ? { ...x, fixed: pinned } : x));
    const ok = await saveFixed(nextDeds.filter((x) => x.fixed));
    if (ok) setDeductions(nextDeds);
  };
  const poolValue = (Number(posProfit) || 0) - [...autoDeds, ...deductions].reduce((s, d) => s + (Number(d.amount) || 0), 0);
  // ---- ก้อนที่ 2 จากหน้า "คอมก้อนที่ 2" ----
  // งวดที่นำเข้าจาก Excel และบันทึกคอมไว้แล้ว → ใช้ยอดคอม 2 ที่บันทึกไว้เดิม (ไม่ทับยอดที่จ่ายไปแล้ว)
  const p2Saved = pool2Row?.results?.persons && !(pool2Row.results.source === 'excel' && savedAt) ? pool2Row.results.persons : null;
  const p2Ids = useMemo(() => new Set([...(pool2Cfg?.sections || []).flatMap((s) => (s.rates || []).filter((r) => r.empId && rateActive(r, { year, month })).map((r) => r.empId)), ...Object.keys(p2Saved || {})]), [pool2Cfg, p2Saved, year, month]);
  const p2Live = useMemo(() => (pool2Cfg ? computePool2({ sections: pool2Cfg.sections || [], answers: submissions[pool2Cfg.formId]?.answers || {}, inputs: pool2Row?.inputs || {}, bonuses: pool2Row?.bonuses || [], period: { year, month } }) : null), [pool2Cfg, pool2Row, submissions, year, month]);
  const p2Stale = useMemo(() => (p2Saved && p2Live && pool2Row?.results?.source !== 'excel' ? pool2Changed(p2Saved, p2Live.persons) : []), [p2Saved, p2Live, pool2Row]);
  // null = ไม่มียอดก้อนที่ 2 ที่บันทึกไว้ → กรอกเอง · { here: true, amount } = ลงที่ธุรกิจนี้ · { here: false } = ไปลงหน้าคอมของธุรกิจหลัก
  const pool2Of = (e) => {
    if (!p2Saved || !p2Ids.has(e.id)) return null;
    if (e.businessId !== activeBusinessId) return { here: false, biz: businesses.find((b) => b.id === e.businessId)?.name || 'ธุรกิจหลัก' };
    return { here: true, amount: Number(p2Saved[e.id]?.total) || 0 };
  };
  const amount2Of = (e) => { const p = pool2Of(e); return p ? (p.here ? p.amount : 0) : entries[e.id]?.amount2; };
  const setEntry = (empId, patch) => setEntries((prev) => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));
  const computedFor = (empId) => Math.round(poolValue * (Number(entries[empId]?.pct) || 0) / 100 * 100) / 100;
  const fillFromPct = () => setEntries((prev) => {
    const next = { ...prev };
    bizEmployees.forEach((e) => {
      const pct = Number(next[e.id]?.pct) || 0;
      next[e.id] = { ...next[e.id], amount: pct ? Math.round(poolValue * pct / 100 * 100) / 100 : (next[e.id]?.amount ?? '') };
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
    // คนที่ลาออกแล้ว (อยู่ในรายชื่อเพราะมีคอมก้อนที่ 2 เดือนสุดท้าย) → ได้แค่คอม 2 ไม่ได้ก้อนที่ 1 และไม่รับส่วนแบ่ง
    rows: bizEmployees.map((e) => (isActive(e)
      ? { id: e.id, dept: deptOf(e), pct: entries[e.id]?.pct, amount: entries[e.id]?.amount, amount2: amount2Of(e), excessDays: excessFor(e.id) }
      : { id: e.id, dept: deptOf(e), pct: 0, amount: null, amount2: amount2Of(e), excessDays: excessFor(e.id), noShare: true })),
  }), [bizEmployees, entries, poolValue, payrollExcess, positions, activeBusinessId, p2Saved, p2Ids]);
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
  // ใส่ตัวเลขจากฟอร์มผู้จัดการเป็นรายการหัก — จับคู่ด้วย srcKey (ฟอร์ม.ช่อง) ก่อน แล้วค่อยชื่อ (ตัดช่องว่าง) → ทับยอดเดิม · ไม่เจอ → เพิ่มแถวใหม่
  const findDed = (list, srcKey, label) => {
    const key = String(label || '').trim();
    let i = srcKey ? list.findIndex((x) => x.srcKey === srcKey) : -1;
    if (i < 0) i = list.findIndex((x) => String(x.label || '').trim() === key);
    return i;
  };
  const applyFromForm = (srcKey, label, amount, srcPeriod) => {
    const key = String(label || '').trim();
    setDeductions((d) => {
      const i = findDed(d, srcKey, key);
      if (i >= 0) return d.map((x, idx) => (idx === i ? { ...x, amount, srcKey, srcPeriod: srcPeriod || null } : x));
      return [...d, { label: key, amount, srcKey, srcPeriod: srcPeriod || null }];
    });
    setDedCarried(false);
  };
  const dedAmountOf = (srcKey, label) => {
    const i = findDed(deductions, srcKey, label);
    const x = i >= 0 ? deductions[i] : null;
    return x && x.amount !== '' && x.amount != null ? Number(x.amount) : null;
  };

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
            pct: isActive(e) ? (Number(entries[e.id]?.pct) || 0) : 0, amount: override && isActive(e) ? r.base1 : null, base1: r.base1 || 0,
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
        pool2Total: calc.totals.base2,
        // srcKey = ฟอร์ม.ช่อง ที่ตัวเลขมาจาก (ถ้ากดจากข้อมูลผู้จัดการ) — เดือนถัดไปจะได้จับคู่ถูกแม้เปลี่ยนชื่อช่อง
        deductions: [...autoDeds.map((d) => ({ label: d.label, amount: d.amount, auto: d.auto, sources: d.sources })), ...deductions.map((d) => ({ label: d.label || '', amount: Number(d.amount) || 0, ...(d.srcKey ? { srcKey: d.srcKey } : {}), ...(d.srcKey && d.srcPeriod ? { srcPeriod: d.srcPeriod } : {}) }))],
        entries: entryList, note: note.trim() || null,
      });
      if (!ok) return;
      setSavedAt(new Date().toISOString()); setDedCarried(false);
      const s2 = {}; entryList.forEach((x) => { s2[x.employeeId] = x.amount2; }); setSaved2(s2);
      // ยอดของรายการที่ปักหมุดเปลี่ยน (เช่น ช้อนส้อมเดือนนี้ 6,000) → เดือนถัดไปเติมยอดใหม่นี้ให้
      const pinnedNow = deductions.filter((d) => d.fixed && String(d.label || '').trim()).map((d) => ({ label: String(d.label).trim(), amount: Number(d.amount) || 0 }));
      if (JSON.stringify(pinnedNow) !== JSON.stringify(fixedDeds.map((f) => ({ label: String(f.label).trim(), amount: Number(f.amount) || 0 })))) await saveFixed(pinnedNow);
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
                  {(posImport.excluded || []).length > 0 && (
                    <div className="text-xs text-amber-700 mt-0.5" title={posImport.excluded.map((x) => `${x.name} (${fmtMoney(x.profit)})`).join('\n')}>ตัดออกไม่คิดคอม {posImport.excluded.length} รายการ "รายวัน" (กำไร {fmtMoney(posImport.excludedProfit)}): {posImport.excluded.map((x) => x.name).join(', ')}</div>
                  )}
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
              <input type="number" step="0.01" value={posProfit} onChange={(e) => setPosProfit(e.target.value)} onBlur={() => savePos({ posProfit: Number(posProfit) || 0 })} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40" placeholder="เช่น 335574.69" />
              <p className="text-xs text-stone-400 mt-1">{posImport ? 'เติมจากไฟล์ที่นำเข้า — แก้ทับได้' : 'นำเข้าไฟล์ด้านบน หรือกรอกเอง'} · <span className="text-emerald-700">บันทึกอัตโนมัติ{posSavedAt ? ` ${fmt(posSavedAt)}` : ''}</span> (เปลี่ยนหน้า/รีเฟรชไม่หาย)</p>
            </FormField>
          </div>
          <UtilityPanel config={utilCfg} result={util} forms={periodForms} usedSources={usedSources} period={{ year, month }} onSaveConfig={saveUtilCfg} disabled={saving || loading} />
          {periodForms.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/50 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-sm font-medium text-sky-900"><ClipboardList className="w-4 h-4" />ข้อมูลจากผู้จัดการ งวด {MONTH_NAMES[month - 1]} {year + 543}</div>
                <button onClick={refreshSubmissions} className="text-xs px-2 py-1 bg-white hover:bg-stone-50 border border-stone-200 rounded-md text-stone-600 flex items-center gap-1"><RefreshCw className="w-3 h-3" />โหลดใหม่</button>
              </div>
              {periodForms.map((f) => {
                const s = submissions[f.id];
                const fields = normalizeFields(f.fields);
                const ledger = fields.some(isLedgerTable);
                // ตารางแบบ Excel: ชิป = ยอดล่าสุดที่มีของแต่ละบัญชี (อาจมาจากเดือนอื่น) · ฟอร์มอื่น: ค่าของงวดนี้
                const inUtility = utilFormSet.has(f.id); // ฟอร์มที่ใช้คิดในกล่องสาธารณูปโภคแล้ว → ไม่ต้องมีชิปให้กดซ้ำ
                const nums = inUtility ? [] : ledger ? latestNumericSummary(fields, formHistory[f.id] || [], { year, month }) : (s ? numericSummary(fields, s.answers, { year, month }) : []);
                const warnCount = nums.filter((n) => n.kind === 'row' || n.kind === 'field').filter((n) => usedSources[`${f.id}.${n.key}@${periodKey(n.period)}`]).length;
                const who = profiles.find((p) => p.id === f.assigneeUserId)?.name || (f.assigneeUserId ? 'ผู้ใช้อื่น' : 'ยังไม่มอบหมาย');
                const open = openForm === f.id;
                return (
                  <div key={f.id} className="bg-white rounded-md border border-sky-100 p-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="text-sm text-stone-800">
                        <b>{f.name}</b> <span className="text-xs text-stone-500">· {who}</span>
                        {' '}
                        {!s ? <span className="text-xs px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">ยังไม่ส่ง</span>
                          : isSubmitted(s) ? <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">ส่งแล้ว {fmt(s.submittedAt)}{editedAfterSubmit(s) ? <b className="text-amber-700"> · แก้ไขหลังส่ง {fmt(s.updatedAt)}</b> : ''}</span>
                          : <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">ร่าง (ยังไม่กดส่ง) {fmt(s.updatedAt)}</span>}
                      </div>
                      {s && <button onClick={() => setOpenForm(open ? null : f.id)} className="text-xs text-sky-700 hover:underline flex items-center gap-1">{open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}{open ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}</button>}
                    </div>
                    {s?.note && <p className="text-xs text-stone-600 mt-1 whitespace-pre-wrap">หมายเหตุ: {s.note}</p>}
                    {ledger && nums.length > 0 && (
                      <p className="text-[11px] text-stone-500 mt-1">ใช้ <b>ยอดล่าสุดที่มี</b> ของแต่ละบัญชี (บิลมาไม่พร้อมกัน) — ป้ายฟ้า = ยอดมาจากเดือนอื่น{warnCount > 0 && <span className="text-rose-700 font-medium"> · ⚠ {warnCount} ตัวเลขเคยใช้คิดคอมงวดก่อนแล้ว (สีแดง) ระวังหักซ้ำ</span>}</p>
                    )}
                    {nums.length > 0 && (() => {
                      // จัดชิปเป็นกลุ่มตามหัวข้อในฟอร์ม (ค่าไฟ / ค่าน้ำ / …) — ฟอร์มที่ไม่มีกลุ่มก็เป็นแถวเดียว
                      const groupsInOrder = [...new Set(nums.map((n) => n.group || ''))];
                      const chip = (n) => {
                        const srcKey = `${f.id}.${n.key}`;
                        const srcPeriod = n.mixed ? null : periodKey(n.period);
                        const cur = dedAmountOf(srcKey, n.label);
                        const applied = cur != null && Math.abs(cur - n.amount) < 0.005;
                        const fromOther = n.period && (n.period.year !== year || n.period.month !== month); // ยอดมาจากเดือนอื่น (บิลเหลื่อมเดือน)
                        const usedBy = srcPeriod ? usedSources[`${srcKey}@${srcPeriod}`] : null;            // งวดคอมอื่นที่เคยใช้ตัวเลขเดียวกันนี้แล้ว
                        const isDraft = n.status !== 'submitted';
                        const apply = () => {
                          if (usedBy && !window.confirm(`ตัวเลขนี้ (${n.label} ${fmtMoney(n.amount)} ของ ${periodLabel(n.period)}) เคยใช้คิดคอมงวด ${usedBy.map((u) => periodLabel(u)).join(', ')} ไปแล้ว — ใช้ซ้ำอีกครั้ง?`)) return;
                          if (isDraft && !window.confirm('ข้อมูลนี้ยังเป็น "ร่าง" (ผู้จัดการยังไม่กดส่ง) — ใช้ตัวเลขนี้เลย?')) return;
                          applyFromForm(srcKey, n.label, n.amount, srcPeriod);
                        };
                        const title = `${n.group ? `${n.group} › ` : ''}${n.label} = ${fmtMoney(n.amount)}`
                          + (n.mixed ? ' · รวมจากยอดล่าสุดของแต่ละรายการ (คนละเดือน)' : n.period ? ` · ยอดของเดือน ${periodLabel(n.period)}${isDraft ? ' (ร่าง)' : ''}` : '')
                          + (usedBy ? ` · ⚠ เคยใช้คิดคอมงวด ${usedBy.map((u) => periodLabel(u)).join(', ')} แล้ว` : '')
                          + (applied ? ' · ใส่เป็นรายการหักแล้ว' : ' — กดเพื่อใส่เป็นรายการหัก');
                        return (
                          <button key={n.key} onClick={apply} title={title}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border ${applied ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : usedBy ? 'bg-rose-50 hover:bg-rose-100 border-rose-200 text-rose-900' : n.kind === 'group' || n.kind === 'column' ? 'bg-amber-50/60 hover:bg-amber-50 border-amber-200 text-stone-800' : 'bg-stone-50 hover:bg-amber-50 border-stone-200 hover:border-amber-300 text-stone-700'}`}>
                            {usedBy && <AlertTriangle className="w-3 h-3 text-rose-600" />}
                            <span>{n.label}</span><b>{fmtMoney(n.amount)}</b>
                            {(fromOther || n.mixed || isDraft) && <span className={`text-[10px] px-1 rounded ${isDraft ? 'bg-amber-100 text-amber-800' : 'bg-sky-100 text-sky-800'}`}>{n.mixed ? 'หลายเดือน' : periodLabel(n.period)}{isDraft ? ' ร่าง' : ''}</span>}
                            {usedBy && <span className="text-[10px] px-1 rounded bg-rose-100 text-rose-800">ใช้แล้ว {usedBy.map((u) => periodLabel(u)).join(', ')}</span>}
                            {applied ? <Check className="w-3 h-3" /> : <ArrowRight className="w-3 h-3" />}
                          </button>
                        );
                      };
                      if (groupsInOrder.length <= 1) return <div className="flex flex-wrap gap-1.5 mt-2">{nums.map(chip)}</div>;
                      return (
                        <div className="mt-2 space-y-1.5">
                          {groupsInOrder.map((g) => (
                            <div key={g || '_'} className="flex flex-wrap items-center gap-1.5">
                              {g && <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded w-20 shrink-0 text-center ${g === 'รวม' ? 'bg-stone-200 text-stone-800' : groupTone(g, groupsInOrder.indexOf(g)).chip}`}>{g}</span>}
                              {nums.filter((n) => (n.group || '') === g).map(chip)}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                    {inUtility && (() => {
                      // บอกให้ชัดว่าส่วนไหนของฟอร์มใช้คิดสาธารณูปโภค ส่วนไหนยังไม่ใช้ (เช่น "สรุปรายตึก" เก็บไว้คิดก้อนที่ 2)
                      const usedKeys = new Set([...(utilCfg?.expense || []), ...(utilCfg?.income || [])].filter((x) => x.formId === f.id).map((x) => x.fieldKey));
                      const numFields = fields.filter((x) => x.type === 'number' || x.type === 'table');
                      const used = numFields.filter((x) => usedKeys.has(x.key)).map((x) => x.label);
                      const unused = numFields.filter((x) => !usedKeys.has(x.key)).map((x) => x.label);
                      return <p className="text-[11px] text-stone-500 mt-1">ส่วน <b>{used.join(', ')}</b> ใช้คำนวณในกล่อง "สาธารณูปโภค" ด้านบนอัตโนมัติ{unused.length > 0 && <> · ส่วน <b>{unused.join(', ')}</b> ยังไม่ได้ใช้คิดก้อนที่ 1</>}</p>;
                    })()}
                    {s && !inUtility && !nums.length && <p className="text-xs text-stone-400 mt-1">ไม่มีตัวเลขในข้อมูลที่ส่งมา</p>}
                    {open && s && <div className="mt-2 pt-2 border-t border-stone-100"><AnswersView fields={fields} answers={s.answers} /></div>}
                  </div>
                );
              })}
              <p className="text-[11px] text-stone-500">กดตัวเลข → ใส่เป็นรายการหักด้านล่าง (ชื่อเดียวกันจะทับยอดเดิม) · ตั้งค่าฟอร์ม/คนกรอกที่เมนู "แบบฟอร์มข้อมูล"</p>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-stone-600">รายการหัก (ช้อนส้อม ฯลฯ){autoDeds.length > 0 && ' — แถวสาธารณูปโภคคำนวณให้อัตโนมัติ'}</span>
              <span className="text-[11px] text-stone-400 mr-auto ml-2 hidden sm:inline">📌 = หักทุกเดือน (เติมยอดให้เองเดือนใหม่ แก้/ลบได้)</span>
              <button onClick={addDeduction} className="text-xs text-emerald-700 hover:underline flex items-center gap-1"><Plus className="w-3 h-3" />เพิ่มรายการหัก</button>
            </div>
            <div className="space-y-2">
              {dedCarried && deductions.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ดึงชื่อรายการหักจากเดือนก่อนมาให้แล้ว — ใส่ตัวเลขของเดือนนี้ แล้วกดบันทึก</p>
              )}
              {autoDeds.map((d) => (
                <div key={d.auto} className="flex items-center gap-2" title="คำนวณจากกล่องสาธารณูปโภค — แก้ที่ปุ่ม เลือกรายการ / วิธีหัก">
                  <span className="w-[26px] shrink-0" /><div className="flex-1 px-3 py-1.5 border border-yellow-200 bg-yellow-50 rounded-lg text-sm text-stone-700 flex items-center gap-1.5"><span className="text-[10px] px-1 rounded bg-yellow-200 text-yellow-900">อัตโนมัติ</span>{d.label}</div>
                  <div className={`w-32 px-3 py-1.5 border border-yellow-200 bg-yellow-50 rounded-lg text-sm text-right tabular-nums ${d.amount < 0 ? 'text-emerald-700' : 'text-stone-800'}`}>{fmtMoney(d.amount)}</div>
                  <span className="w-7" />
                </div>
              ))}
              {deductions.length === 0 && !autoDeds.length && <p className="text-xs text-stone-400">ยังไม่มีรายการหัก</p>}
              {deductions.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <button type="button" onClick={() => togglePin(i)} title={d.fixed ? 'หักทุกเดือน (เดือนใหม่เติมให้อัตโนมัติ) — กดเพื่อเลิก' : 'ปักหมุด = หักทุกเดือน เดือนใหม่เติมยอดให้อัตโนมัติ'} className={`p-1.5 rounded ${d.fixed ? 'text-amber-600 bg-amber-50 hover:bg-amber-100' : 'text-stone-300 hover:text-stone-500 hover:bg-stone-100'}`}><Pin className={`w-3.5 h-3.5 ${d.fixed ? 'fill-current' : ''}`} /></button>
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

        {/* ก้อนที่ 2 — มาจากหน้า "คอมก้อนที่ 2" */}
        <div className="bg-white border border-stone-200 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap"><Banknote className="w-4 h-4 text-sky-700" /><h3 className="text-sm font-medium text-stone-800">ก้อนที่ 2 — คอมจากค่าเช่า / ร้านค้า</h3>
            {onOpenPool2 && <button onClick={() => onOpenPool2(year, month)} className="ml-auto text-xs px-2.5 py-1.5 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-md text-sky-800 flex items-center gap-1">เปิดหน้าคอมก้อนที่ 2<ArrowRight className="w-3 h-3" /></button>}
          </div>
          {p2Saved ? (() => {
            const here = bizEmployees.map((e) => ({ e, p: pool2Of(e) })).filter((x) => x.p);
            const mine = here.filter((x) => x.p.here);
            const elsewhere = here.filter((x) => !x.p.here);
            return (
              <>
                <p className="text-xs text-stone-600">
                  {pool2Row?.results?.source === 'excel' ? 'ยอดจาก Excel (นำเข้า)' : <>บันทึกที่หน้าคอมก้อนที่ 2 เมื่อ {fmt(pool2Row?.updatedAt)}</>} — ลงช่อง <b className="text-sky-800">คอม 2</b> ให้อัตโนมัติ
                  {mine.length > 0 ? <> {mine.length} คน รวม <b className="text-sky-800">{fmtMoney(mine.reduce((t, x) => t + x.p.amount, 0))} ฿</b></> : ' (ไม่มีคนที่ธุรกิจหลักคือธุรกิจนี้)'}
                </p>
                {elsewhere.length > 0 && <p className="text-[11px] text-stone-500">{elsewhere.map((x) => `${dispName(x.e)} → หน้า ${x.p.biz}`).join(' · ')} (คอมก้อนที่ 2 ไปขึ้นที่ธุรกิจหลัก ไม่นับซ้ำที่นี่)</p>}
                {savedAt && mine.some((x) => Math.abs((saved2[x.e.id] || 0) - x.p.amount) >= 0.005) && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />ยอดก้อนที่ 2 เปลี่ยนหลังบันทึกคอมงวดนี้ — กด "บันทึกคอม" อีกครั้ง ยอดในเงินเดือนจะได้ตรง</p>}
                {p2Stale.length > 0 && <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />ข้อมูลก้อนที่ 2 เปลี่ยนหลังบันทึก — เปิดหน้าคอมก้อนที่ 2 แล้วกดบันทึกใหม่ก่อน ยอดที่นี่จะได้ตรง</p>}
              </>
            );
          })() : (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">ยังไม่ได้บันทึกคอมก้อนที่ 2 ของงวดนี้ — ไปคิดและกดบันทึกที่หน้า "คอมก้อนที่ 2" แล้วยอดรายคนจะมาลงช่อง คอม 2 ให้เอง (ระหว่างนี้กรอกเองในตารางได้)</p>
          )}
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
                  <th className="text-center py-1 px-2 bg-sky-50/50">ก้อนที่ 2</th>
                  <th className="text-right py-2 px-2" rowSpan={2}>รวม</th>
                  <th className="text-center py-1 px-2 bg-amber-50/60" colSpan={3}>วันหยุดเกินสิทธิ</th>
                  <th className="text-right py-2 px-2 w-28" rowSpan={2}>สุทธิ</th>
                </tr>
                <tr className="text-xs text-stone-500 border-b border-stone-200">
                  <th className="text-right py-1 px-2 w-20 bg-emerald-50/50">%</th>
                  <th className="text-right py-1 px-2 w-28 bg-emerald-50/50">คอม 1</th>
                  <th className="text-right py-1 px-2 w-28 bg-sky-50/50">คอม 2</th>
                  <th className="text-right py-1 px-2 w-16 bg-amber-50/60">วัน</th>
                  <th className="text-right py-1 px-2 w-24 bg-amber-50/60">หลังหัก</th>
                  <th className="text-right py-1 px-2 w-24 bg-amber-50/60">รับแบ่ง</th>
                </tr>
              </thead>
              <tbody>
                {bizEmployees.length === 0 && <tr><td colSpan={9} className="text-center text-stone-400 py-6">ไม่มีพนักงานในธุรกิจนี้</td></tr>}
                {groups.map((g) => {
                  const dc = calc.depts[g.id] || { forfeited: 0, recipients: 0, share: 0, unassigned: 0 };
                  return (
                    <React.Fragment key={g.id}>
                      <tr className="bg-stone-100/70">
                        <td colSpan={9} className="px-2 py-1.5">
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
                        const p2 = pool2Of(e);
                        return (
                          <tr key={e.id} className="border-b border-stone-50">
                            <td className="py-1.5 px-2 whitespace-nowrap"><span className="font-mono text-xs text-stone-400 mr-1">#{e.employeeNumber}</span>{dispName(e)}</td>
                            <td className="py-1.5 px-2 bg-emerald-50/30"><input type="number" step="0.001" value={entries[e.id]?.pct ?? ''} onChange={(ev) => setEntry(e.id, { pct: ev.target.value })} className={numCell} placeholder="0" /></td>
                            <td className="py-1.5 px-2 bg-emerald-50/30">
                              <input type="number" step="0.01" value={entries[e.id]?.amount ?? ''} onChange={(ev) => setEntry(e.id, { amount: ev.target.value })} className={`${numCell} ${amountSet ? 'text-emerald-800' : 'text-stone-500'}`} placeholder={fmtMoney(computedFor(e.id))} title={amountSet ? 'ยอดที่กำหนดเอง (ลบออกเพื่อกลับไปใช้ % × กองกลาง)' : `คิดจาก % อัตโนมัติ = ${fmtMoney(computedFor(e.id))}`} />
                            </td>
                            <td className="py-1.5 px-2 bg-sky-50/30">
                              {p2
                                ? (p2.here
                                  ? <div className={`text-right px-2 py-1.5 rounded bg-sky-100/70 tabular-nums ${p2.amount < 0 ? 'text-red-600' : 'text-sky-900'}`} title="จากหน้าคอมก้อนที่ 2 (แก้ที่นั่น)">{fmtMoney(p2.amount)}</div>
                                  : <div className="text-right px-2 py-1.5 text-[11px] text-stone-400" title={`คอมก้อนที่ 2 ของคนนี้ไปขึ้นหน้าคอมของ ${p2.biz}`}>อยู่หน้า {p2.biz}</div>)
                                : <input type="number" step="0.01" value={entries[e.id]?.amount2 ?? ''} onChange={(ev) => setEntry(e.id, { amount2: ev.target.value })} className={`${numCell} text-sky-800`} placeholder="0" />}
                            </td>
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
