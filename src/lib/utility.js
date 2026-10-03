// ============ สาธารณูปโภค (น้ำ-ไฟ-เน็ต-โทร) สำหรับคอมก้อนที่ 1 ============
// รายจ่าย = บิลที่เลือก (จากฟอร์มค่าน้ำไฟของผู้จัดการตลาด) · รายรับ = เงินที่เก็บจากผู้เช่า (จากฟอร์มผู้เช่าของผู้จัดการอพาร์ตเมนต์)
// กำไร/ขาดทุนสาธารณูปโภค = รายรับ − รายจ่าย  → เอาไปหักกองกลางตาม mode:
//   'excel'   (ค่าตั้งต้น, ตาม Excel เดิม): หัก "รายจ่ายรวม" + หัก "ขาดทุน (รายจ่าย − รายรับ)"  (ถ้ากำไร ส่วนที่ 2 ติดลบ = บวกกลับ เหมือนสูตร Excel)
//   'net'     : หักเฉพาะ (รายจ่าย − รายรับ)
//   'expense' : หักเฉพาะรายจ่ายรวม (ไม่สนรายรับ)
// ค่าที่ใช้ = "ยอดล่าสุดที่มี" ของแต่ละช่อง (บิลมาไม่พร้อมกัน) แต่ไม่เกินเดือนถัดจากงวด — เปิดงวดเก่าย้อนดูทีหลัง ตัวเลขจะไม่วิ่งตามเดือนใหม่ๆ
// config เก็บในตาราง commission_settings.utility (ต่อธุรกิจ ไม่ผูกงวด) — เปลี่ยนรายการที่เลือกได้จากหน้าคอม
import { normalizeFields, isLedgerTable, tableRows, latestCell, periodNum } from './dataForms.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const UTILITY_MODES = [
  { value: 'excel', label: 'แบบ Excel เดิม: หักรายจ่ายรวม + หักส่วนที่ขาดทุน' },
  { value: 'net', label: 'หักเฉพาะส่วนที่ขาดทุน (รายจ่าย − รายรับ)' },
  { value: 'expense', label: 'หักเฉพาะรายจ่ายรวม (ไม่นับรายรับ)' },
];
const refOf = (x) => `${x.formId}.${x.fieldKey}.${x.rowKey || ''}.${x.colKey || ''}`;
// srcKey แบบเดียวกับชิปในหน้าคอม (formId.field.row.col / formId.field) → ใช้เช็ก "เคยใช้คิดคอมแล้ว" ร่วมกัน
const srcKeyOf = (x) => (x.rowKey ? `${x.formId}.${x.fieldKey}.${x.rowKey}.${x.colKey}` : `${x.formId}.${x.fieldKey}`);

// ทุกช่องตัวเลขที่เลือกมาคิดได้ จากฟอร์มที่ส่งมา → [{ ref, formId, formName, fieldKey, rowKey, colKey, label, sub, group, ledger }]
function utilityCandidates(forms) {
  const out = [];
  (forms || []).forEach((form) => {
    normalizeFields(form.fields).forEach((f) => {
      if (f.type === 'number') {
        const x = { formId: form.id, formName: form.name, fieldKey: f.key, rowKey: '', colKey: '', label: f.label || f.key, sub: '', group: f.label || f.key, ledger: false };
        out.push({ ...x, ref: refOf(x) });
        return;
      }
      if (f.type !== 'table' || !(f.rows || []).length) return;
      const numCols = (f.columns || []).filter((c) => c.type === 'number');
      const ledger = isLedgerTable(f);
      (f.rows || []).forEach((r) => numCols.forEach((c) => {
        const label = numCols.length > 1 ? `${r.label} · ${c.label}` : r.label;
        const x = { formId: form.id, formName: form.name, fieldKey: f.key, rowKey: r.key, colKey: c.key, label, sub: r.sub || '', group: r.group || f.label || f.key, ledger };
        out.push({ ...x, ref: refOf(x) });
      }));
    });
  });
  return out;
}

// histories: { [formId]: [{ year, month, answers, status }] } · period: งวดคอม { year, month }
function computeUtility(config, forms, histories, period) {
  const cands = utilityCandidates(forms);
  const byRef = new Map(cands.map((c) => [c.ref, c]));
  const cap = periodNum(period.month === 12 ? { year: period.year + 1, month: 1 } : { year: period.year, month: period.month + 1 });
  const valueOf = (sel) => {
    const subs = (histories?.[sel.formId] || []).filter((s) => periodNum(s) <= cap);
    return latestCell(subs, sel.fieldKey, sel.rowKey ? sel.rowKey : null, sel.colKey);
  };
  const build = (list, withDivisor) => (list || []).map((sel) => {
    const cand = byRef.get(refOf(sel));
    const cell = valueOf(sel);
    const raw = cell ? r2(cell.value) : 0;
    const divisor = withDivisor ? (Number(sel.divisor) > 0 ? Number(sel.divisor) : 1) : 1;
    return {
      ref: refOf(sel), srcKey: srcKeyOf(sel), missingDef: !cand,
      label: cand?.label || '(ช่องนี้ถูกลบจากฟอร์มแล้ว)', sub: cand?.sub || '', group: cand?.group || '', formName: cand?.formName || '',
      raw, divisor, value: r2(raw / divisor), has: !!cell,
      period: cell ? { year: cell.year, month: cell.month } : null, status: cell?.status || null,
    };
  });
  const expense = build(config?.expense, false);
  const income = build(config?.income, true);
  const expenseTotal = r2(expense.reduce((s, x) => s + x.value, 0));
  const incomeTotal = r2(income.reduce((s, x) => s + x.value, 0));
  const net = r2(incomeTotal - expenseTotal); // + = กำไร · − = ขาดทุน
  const mode = UTILITY_MODES.some((m) => m.value === config?.mode) ? config.mode : 'excel';
  const srcOf = (items) => items.filter((x) => x.has).map((x) => ({ srcKey: x.srcKey, srcPeriod: `${x.period.year}-${String(x.period.month).padStart(2, '0')}` }));
  const deductions = [];
  if (config?.enabled && (expense.length || income.length)) {
    if (mode === 'excel' || mode === 'expense') {
      deductions.push({ auto: 'utility_expense', label: 'ค่าสาธารณูปโภครวม (บิลที่จ่าย)', amount: expenseTotal, sources: srcOf(expense) });
    }
    if (mode === 'excel' || mode === 'net') {
      deductions.push({ auto: 'utility_net', label: net < 0 ? 'สาธารณูปโภคขาดทุน (รายจ่าย − รายรับผู้เช่า)' : 'สาธารณูปโภคกำไร (รายรับผู้เช่า − รายจ่าย) บวกกลับ', amount: r2(-net), sources: srcOf(income) });
    }
  }
  return { expense, income, expenseTotal, incomeTotal, net, mode, deductions, missingExpense: expense.filter((x) => !x.has).length, missingIncome: income.filter((x) => !x.has).length };
}

// ฟอร์มที่ config อ้างถึง (ไว้โหลดประวัติ + ซ่อนชิปซ้ำในกล่อง "ข้อมูลจากผู้จัดการ")
const utilityFormIds = (config) => [...new Set([...(config?.expense || []), ...(config?.income || [])].map((x) => x.formId))];

export { UTILITY_MODES, refOf, srcKeyOf, utilityCandidates, computeUtility, utilityFormIds };
