// ============ แบบฟอร์มข้อมูลประจำเดือน (data_forms / data_form_submissions) ============
// เจ้าของสร้างฟอร์ม + มอบหมายผู้ใช้ให้กรอกทุกเดือน (เช่น ผู้จัดการส่งค่าน้ำไฟ / ผู้เช่าเข้าออก)
// ค่าที่กรอกเก็บเป็น answers: { [field.key]: value }
//   number/text/date/textarea → ค่าเดี่ยว (string/number)
//   table แบบแถวคงที่ (rows มี)   → { [row.key]: { [col.key]: value } }
//   table แบบเพิ่มแถวเอง (rows ว่าง) → [ { [col.key]: value }, ... ]
// phase 1 คีย์มือ (source = manual) · phase 2 ดึงจากแอพ maruay-property (source = maruay-property) — โครง answers เหมือนกัน

const FIELD_TYPES = [
  { value: 'number', label: 'ตัวเลข' },
  { value: 'text', label: 'ข้อความสั้น' },
  { value: 'textarea', label: 'ข้อความยาว' },
  { value: 'date', label: 'วันที่' },
  { value: 'table', label: 'ตาราง' },
];
const COLUMN_TYPES = [
  { value: 'number', label: 'ตัวเลข' },
  { value: 'text', label: 'ข้อความ' },
];
const SOURCES = [
  { value: 'manual', label: 'กรอกเอง (phase 1)' },
  { value: 'maruay-property', label: 'ดึงจากแอพ maruay-property (phase 2 — ยังไม่เปิดใช้)' },
];

// คีย์ของช่อง/คอลัมน์/แถว — ต้องคงที่หลังสร้าง ไม่งั้นข้อมูลเดือนเก่าจะหาค่าไม่เจอ
const newKey = (prefix = 'f') => `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const isBlank = (v) => v == null || v === '' || (typeof v === 'string' && !v.trim());

// ทำให้นิยามช่องอยู่ในรูปที่ UI ใช้ได้เสมอ (จาก DB อาจเป็น null / ขาด columns)
// ช่องที่ไม่มี key (เช่น seed ด้วย SQL / นำเข้าจาก maruay-property) ใช้ key ตามตำแหน่ง — ต้องคงที่ทุกครั้งที่เรียก ไม่ใช่สุ่มใหม่ ไม่งั้นคำตอบเก่าจะหาไม่เจอ
function normalizeField(f, i = 0) {
  const type = FIELD_TYPES.some((t) => t.value === f?.type) ? f.type : 'text';
  const out = { key: f?.key || `f${i}`, label: f?.label || '', type, unit: f?.unit || '', hint: f?.hint || '', required: !!f?.required };
  if (type === 'table') {
    out.columns = (Array.isArray(f?.columns) ? f.columns : []).map((c, ci) => ({ key: c?.key || `c${ci}`, label: c?.label || '', type: c?.type === 'text' ? 'text' : 'number' }));
    out.rows = (Array.isArray(f?.rows) ? f.rows : []).map((r, ri) => ({ key: r?.key || `r${ri}`, label: r?.label || '' }));
  }
  return out;
}
const normalizeFields = (fields) => (Array.isArray(fields) ? fields : []).map((f, i) => normalizeField(f, i));
// ค่าของตารางเป็นคนละรูปกับนิยามปัจจุบัน (เช่น เปลี่ยนตารางจากแถวคงที่ ↔ เพิ่มแถวเองหลังมีคนกรอกไปแล้ว)
const tableShapeMismatch = (field, value) => value != null && typeof value === 'object' && (Array.isArray(value) !== isDynamicTable(field)) && (Array.isArray(value) ? value.length > 0 : Object.keys(value).length > 0);
const isDynamicTable = (field) => field.type === 'table' && !(field.rows || []).length;

// แถวของตาราง (ทั้งแบบคงที่และเพิ่มเอง) → [{ key, label, cells: { [col.key]: value } }]
function tableRows(field, value) {
  if (isDynamicTable(field)) return (Array.isArray(value) ? value : []).map((cells, i) => ({ key: String(i), label: '', cells: cells || {} }));
  const v = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return (field.rows || []).map((r) => ({ key: r.key, label: r.label, cells: v[r.key] || {} }));
}

// ผลรวมต่อคอลัมน์ตัวเลข → { [col.key]: total }
function tableColumnTotals(field, value) {
  const totals = {};
  const rows = tableRows(field, value);
  (field.columns || []).forEach((c) => {
    if (c.type !== 'number') return;
    totals[c.key] = r2(rows.reduce((s, r) => s + num(r.cells[c.key]), 0));
  });
  return totals;
}

// ตัวเลขทั้งหมดที่ดึงไปใช้ต่อได้ (เช่น กดใส่เป็นรายการหักคอม)
// → [{ key, label, amount, kind: 'field' | 'column' }]
function numericSummary(fields, answers) {
  const out = [];
  const a = answers && typeof answers === 'object' ? answers : {};
  const fs = normalizeFields(fields);
  // ชื่อรายการหักใช้ชื่อคอลัมน์สั้นๆ ("คงเหลือใช้ของศูนย์อาหาร") — ถ้าชื่อคอลัมน์ซ้ำกันข้ามตาราง/ซ้ำกับช่องตัวเลข ค่อยนำหน้าด้วยชื่อตาราง
  const labelCount = {};
  fs.forEach((f) => {
    if (f.type === 'number') labelCount[f.label] = (labelCount[f.label] || 0) + 1;
    if (f.type === 'table') (f.columns || []).forEach((c) => { if (c.type === 'number') labelCount[c.label] = (labelCount[c.label] || 0) + 1; });
  });
  fs.forEach((f) => {
    if (f.type === 'number') {
      if (!isBlank(a[f.key])) out.push({ key: f.key, label: f.label || f.key, amount: r2(a[f.key]), kind: 'field' });
    } else if (f.type === 'table') {
      const totals = tableColumnTotals(f, a[f.key]);
      (f.columns || []).forEach((c) => {
        if (c.type !== 'number') return;
        // คอลัมน์ที่ไม่มีใครกรอกเลย ไม่ต้องโชว์เป็น 0 ให้รก
        const any = tableRows(f, a[f.key]).some((r) => !isBlank(r.cells[c.key]));
        if (!any) return;
        const label = c.label && labelCount[c.label] === 1 ? c.label : `${f.label || f.key} — ${c.label || c.key}`;
        out.push({ key: `${f.key}.${c.key}`, label, amount: totals[c.key] || 0, kind: 'column', group: f.label || f.key });
      });
    }
  });
  return out;
}

// นับความคืบหน้าการกรอก (ช่องเดี่ยว + เซลล์ตารางแบบแถวคงที่) → { filled, total, missingRequired: [label] }
function answerProgress(fields, answers) {
  const a = answers && typeof answers === 'object' ? answers : {};
  let filled = 0, total = 0; const missingRequired = [];
  normalizeFields(fields).forEach((f) => {
    if (f.type === 'table') {
      const rows = tableRows(f, a[f.key]);
      let any = false;
      if (isDynamicTable(f)) { total += 1; any = rows.length > 0; if (any) filled += 1; }
      else rows.forEach((r) => (f.columns || []).forEach((c) => { total += 1; if (!isBlank(r.cells[c.key])) { filled += 1; any = true; } }));
      if (f.required && !any) missingRequired.push(f.label || f.key);
      return;
    }
    total += 1;
    if (!isBlank(a[f.key])) filled += 1;
    else if (f.required) missingRequired.push(f.label || f.key);
  });
  return { filled, total, missingRequired };
}

const isSubmitted = (s) => s?.status === 'submitted';
// แก้ไขหลังกดส่ง (เกิน 1 นาทีหลังส่ง) — คนคิดคอมที่ดึงตัวเลขไปแล้วต้องรู้
const editedAfterSubmit = (s) => isSubmitted(s) && !!s.updatedAt && !!s.submittedAt && (new Date(s.updatedAt) - new Date(s.submittedAt) > 60000);
const prevPeriod = (year, month) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 });
const nextPeriod = (year, month) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 });

export {
  FIELD_TYPES,
  COLUMN_TYPES,
  SOURCES,
  newKey,
  normalizeField,
  normalizeFields,
  isDynamicTable,
  tableShapeMismatch,
  tableRows,
  tableColumnTotals,
  numericSummary,
  answerProgress,
  isSubmitted,
  editedAfterSubmit,
  isBlank,
  prevPeriod,
  nextPeriod,
};
