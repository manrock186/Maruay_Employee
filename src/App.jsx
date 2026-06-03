import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Users, Building2, MapPin, Briefcase, Settings, LogOut,
  Plus, Edit2, Trash2, Search, X, Upload, ChevronRight,
  Home, UserCircle, Shield, Layers, Camera, Calendar, Phone, Mail,
  Eye, EyeOff, Network, Save, ChevronDown, ChevronUp, User,
  KeyRound, AlertCircle, CheckCircle2, Crown, Award, MapPinned, Clock,
  Globe, CreditCard, BookOpen, FileText, ExternalLink, Paperclip,
  Wallet, Banknote, Calculator, Receipt, Minus, TrendingUp, TrendingDown, Bell, BellRing, Check, CheckCheck, Hash, Menu, Wrench, Percent
} from 'lucide-react';
import { supabase, fromDB, toDB } from './supabase.js';

// ============ DISPLAY NAME HELPER ============
// ทุกหน้าให้แสดงชื่อเล่นเป็นหลัก ถ้าไม่มีชื่อเล่นค่อย fallback ใช้ชื่อจริง
const dispName = (e) => (e?.nickname?.trim() || e?.name?.trim() || '');

// ============ NATIONALITY ============
const NATIONALITIES = [
  { value: 'thai',     label: 'ไทย',     flag: '🇹🇭' },
  { value: 'myanmar',  label: 'พม่า',    flag: '🇲🇲' },
  { value: 'cambodia', label: 'กัมพูชา', flag: '🇰🇭' },
  { value: 'laos',     label: 'ลาว',     flag: '🇱🇦' },
  { value: 'other',    label: 'อื่นๆ',   flag: '🌐' },
];
const natLabel = (v) => NATIONALITIES.find((n) => n.value === v)?.label || (v ? 'อื่นๆ' : '—');
const natFlag = (v) => NATIONALITIES.find((n) => n.value === v)?.flag || (v ? '🌐' : '');
const isForeign = (v) => v && v !== 'thai';

// ============ การลาออก ============
const RESIGN_REASONS = [
  { value: 'voluntary',    label: 'ลาออกเอง' },
  { value: 'terminated',   label: 'เลิกจ้าง' },
  { value: 'contract_end', label: 'หมดสัญญา' },
  { value: 'other',        label: 'อื่นๆ' },
];
const resignLabel = (v) => RESIGN_REASONS.find((r) => r.value === v)?.label || 'อื่นๆ';
const isActive = (e) => (e?.status || 'active') === 'active';

// ============ การปรับเงินเดือน ============
const SALARY_REASONS = [
  { value: 'performance',    label: 'ผลงานดี' },
  { value: 'annual',         label: 'ปรับขั้นประจำปี' },
  { value: 'promotion',      label: 'เลื่อนตำแหน่ง' },
  { value: 'cost_of_living', label: 'ปรับตามค่าครองชีพ' },
  { value: 'other',          label: 'อื่นๆ' },
];
const salaryReasonLabel = (v) => SALARY_REASONS.find((r) => r.value === v)?.label || 'อื่นๆ';
const todayStr = () => new Date().toISOString().slice(0, 10);

// ============ ธีมสี ============
const THEMES = [
  { value: 'default', label: 'ค่าเริ่มต้น', desc: 'เขียว + ทอง',   primary: '#059669', accent: '#f59e0b' },
  { value: 'calm',    label: 'สบายตา',     desc: 'เขียวเทา เย็นตา', primary: '#0d9488', accent: '#f59e0b' },
  { value: 'vibrant', label: 'สีสัน',      desc: 'ม่วง + ชมพู สดใส', primary: '#7c3aed', accent: '#ec4899' },
  { value: 'ocean',   label: 'ฟ้าทะเล',    desc: 'น้ำเงิน + ฟ้า',   primary: '#2563eb', accent: '#06b6d4' },
  { value: 'grape',   label: 'ม่วง',       desc: 'ม่วง + ทอง หรูหรา', primary: '#9333ea', accent: '#f59e0b' },
  { value: 'dark',    label: 'ดาร์กโหมด',  desc: 'พื้นดำ ถนอมสายตา', primary: '#10b981', accent: '#1c1c22', dark: true },
];
const applyTheme = (theme) => {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme || 'default';
};

// ============ PAYROLL HELPERS ============
const MONTH_NAMES = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
// ป้ายเดือนที่จ่ายเงิน (งวดทำงานเดือน month → จ่ายต้นเดือนถัดไป)
function payMonthLabel(year, month) {
  const d = new Date(Number(year), Number(month), 1);
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + 543}`;
}
const fmtMoney = (n) => (Number(n) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// ฟอร์แมตวันที่ไทย (กันค่าว่าง/วันที่ไม่ถูกต้องไม่ให้แอปขาว)
const fmt = (d) => {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
};

// คำนวณประกันสังคม: 5% ของฐาน สูงสุด 750
const calcSocialSecurity = (baseSalary) => Math.min(Math.round(Number(baseSalary) * 0.05 * 100) / 100, 750);

// คำนวณยอดเงินเดือนสุทธิจากข้อมูล payroll + รายการ items
function computePayroll(p, items = []) {
  const daily = (Number(p.baseSalary) || 0) / 30;
  // รายรับ
  const holidayWorkPay = (Number(p.holidayWorkDays) || 0) * daily;
  const bonusTasks = items.filter((i) => i.kind === 'bonus_task').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalIncome = (Number(p.baseSalary) || 0) + (Number(p.commission) || 0) + holidayWorkPay + bonusTasks;
  // รายการหัก
  const excessDays = Math.max(0, (Number(p.holidayDaysTaken) || 0) - (Number(p.holidayQuota) || 0));
  const excessHolidayDeduction = excessDays * daily;
  const advances = items.filter((i) => i.kind === 'advance').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const otherDeductions = items.filter((i) => i.kind === 'other_deduction').reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const totalDeduction = excessHolidayDeduction + (Number(p.lateDeduction) || 0) + (Number(p.socialSecurity) || 0)
    + (Number(p.roomFee) || 0) + (Number(p.paidViaCompany) || 0) + advances + otherDeductions;
  const net = totalIncome - totalDeduction;
  return { daily, holidayWorkPay, bonusTasks, totalIncome, excessDays, excessHolidayDeduction, advances, otherDeductions, totalDeduction, net };
}

// ============ PROBATION (ทดลองงาน) ============
// อยู่ในช่วงทดลองงานของงวด (year, month) ไหม — นับเป็นจำนวนรอบบิลจากเดือนเริ่มงาน
function isProbationPeriod(emp, year, month) {
  if (!emp?.onProbation || !emp.startDate || !Number(emp.probationMonths)) return false;
  const start = new Date(emp.startDate);
  if (isNaN(start)) return false;
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const payYM = Number(year) * 12 + (Number(month) - 1);
  const diff = payYM - startYM; // 0 = เดือนเริ่มงาน (รอบบิลแรก)
  return diff >= 0 && diff < Number(emp.probationMonths);
}
// รอบบิลปัจจุบันของช่วงทดลอง (เช่น 1/2) — ใช้แสดงผล
function probationCycle(emp, year, month) {
  if (!emp?.startDate) return null;
  const start = new Date(emp.startDate);
  const startYM = start.getFullYear() * 12 + start.getMonth();
  const diff = Number(year) * 12 + (Number(month) - 1) - startYM;
  return diff + 1; // รอบบิลที่เท่าไหร่นับจากเริ่มงาน
}
// เงินเดือนฐานที่ใช้จริงสำหรับงวดนั้น (ทดลองงาน vs เต็ม)
function effectiveBaseSalary(emp, year, month) {
  if (isProbationPeriod(emp, year, month) && Number(emp.probationSalary) > 0) return Number(emp.probationSalary);
  return Number(emp.baseSalary) || 0;
}
// จำนวนวันในเดือน
function daysInMonth(year, month) { return new Date(Number(year), Number(month), 0).getDate(); }
// สัดส่วนเฉลี่ยเงินเดือนตามวันเริ่มงาน — เฉพาะเดือนที่เริ่มงาน (เข้ากลางเดือนได้สัดส่วน)
function prorationFactor(emp, year, month) {
  if (!emp?.startDate) return 1;
  const s = new Date(emp.startDate);
  if (isNaN(s)) return 1;
  if (s.getFullYear() === Number(year) && s.getMonth() === Number(month) - 1) {
    const dim = daysInMonth(year, month);
    const startDay = s.getDate();
    return (dim - startDay + 1) / dim;
  }
  return 1; // เดือนอื่น = เต็มเดือน
}
// เงินเดือนฐานที่ควรใช้ตั้งต้นใน payroll งวดนั้น (ทดลองงาน + เฉลี่ยวันเริ่มงาน)
function payrollBaseSalary(emp, year, month) {
  return Math.round(effectiveBaseSalary(emp, year, month) * prorationFactor(emp, year, month));
}

// ============ MULTI-BUSINESS (1 คน หลายสังกัด) ============
// มีการแยกเงินเดือนตามธุรกิจไหม
function hasSalarySplit(emp) { return !!(emp?.salarySplit && Object.keys(emp.salarySplit).length); }
// ธุรกิจทั้งหมดที่พนักงานสังกัด (หลัก + เพิ่มเติม)
function employeeBusinessIds(emp) {
  return [emp?.businessId, ...((emp?.additionalBusinessIds) || [])].filter((v, i, a) => v && a.indexOf(v) === i);
}
// ตำแหน่งของพนักงานในธุรกิจหนึ่ง (per-business role) — ไม่มีก็ fallback ตำแหน่งหลัก
function businessPositionId(emp, businessId) {
  const bp = emp?.businessPositions || {};
  if (bp[businessId]) return bp[businessId];
  if (businessId === emp?.businessId) return emp?.positionId || null;
  return null;
}
// เงินเดือนฐานของพนักงานในธุรกิจหนึ่ง — จากการแยกเงินเดือน หรือธุรกิจหลักใช้ base_salary
function businessBaseSalary(emp, businessId) {
  if (hasSalarySplit(emp) && emp.salarySplit[businessId] != null) return Number(emp.salarySplit[businessId]) || 0;
  if (businessId === emp?.businessId) return Number(emp?.baseSalary) || 0;
  return 0;
}
// เงินเดือนฐานตั้งต้นใน payroll ของธุรกิจหนึ่ง (รวมทดลองงาน+เฉลี่ยวันเริ่มงาน)
function payrollBaseSalaryForBiz(emp, businessId, year, month) {
  // ทดลองงาน: ใช้เงินทดลองเฉพาะกรณีไม่ได้แยกเงินเดือน (ธุรกิจหลัก)
  const probation = isProbationPeriod(emp, year, month) && Number(emp.probationSalary) > 0 && !hasSalarySplit(emp) && businessId === emp.businessId;
  const eff = probation ? Number(emp.probationSalary) : businessBaseSalary(emp, businessId);
  return Math.round(eff * prorationFactor(emp, year, month));
}

// ============ COMMISSION (คอมมิชชั่น) ============
// กองกลางคอม = กำไร POS − ผลรวมรายการหัก
function commissionPoolValue(pool) {
  if (!pool) return 0;
  const ded = (pool.deductions || []).reduce((s, d) => s + (Number(d.amount) || 0), 0);
  return (Number(pool.posProfit) || 0) - ded;
}
// ยอดคอมของพนักงานคนหนึ่งในงวด (จาก entries ที่บันทึกไว้)
function commissionForEmployee(pool, employeeId) {
  if (!pool) return 0;
  const e = (pool.entries || []).find((x) => x.employeeId === employeeId);
  return e ? ((Number(e.amount) || 0) + (Number(e.amount2) || 0)) : 0;
}

// ============ ROOM RENT (ค่าห้องพนักงานจากมิเตอร์) ============
// ยอดรวมต่อห้อง = ค่าเช่า + เหมาน้ำ + (มิเตอร์ใหม่ − เก่า) × เรต
function roomTotal(room) {
  const units = Math.max(0, (Number(room.meterCurr) || 0) - (Number(room.meterPrev) || 0));
  const elec = units * (Number(room.elecRate) || 0);
  const rent = Number(room.rent != null ? room.rent : room.fixedExtra) || 0;
  return rent + (Number(room.waterFlat) || 0) + elec;
}
function roomUnits(room) { return Math.max(0, (Number(room.meterCurr) || 0) - (Number(room.meterPrev) || 0)); }
// map employeeId -> ค่าห้องที่ต้องหัก (หารเท่าตามจำนวนคนในห้อง)
function roomRentMapFromPool(pool) {
  const m = {};
  (pool?.rooms || []).forEach((r) => {
    const occ = (r.occupantIds || []).filter(Boolean);
    if (!occ.length) return;
    const share = roomTotal(r) / occ.length;
    occ.forEach((id) => { m[id] = (m[id] || 0) + share; });
  });
  Object.keys(m).forEach((k) => { m[k] = Math.round(m[k] * 100) / 100; });
  return m;
}

// สร้าง draft ตั้งต้นสำหรับ payroll (จาก payroll เดิม หรือ default จากโปรไฟล์พนักงาน)
function buildPayrollDraft(emp, payroll, items, year, month, businessId) {
  if (payroll) {
    return {
      baseSalary: payroll.baseSalary ?? 0,
      holidayQuota: payroll.holidayQuota ?? 4,
      commission: payroll.commission ?? 0,
      holidayWorkDays: payroll.holidayWorkDays ?? 0,
      holidayDaysTaken: payroll.holidayDaysTaken ?? 0,
      lateDeduction: payroll.lateDeduction ?? 0,
      socialSecurity: payroll.socialSecurity ?? 0,
      roomFee: payroll.roomFee ?? 0,
      paidViaCompany: payroll.paidViaCompany ?? 0,
      note: payroll.note ?? '',
      status: payroll.status ?? 'draft',
      items: (items || []).map((i) => ({ kind: i.kind, label: i.label, amount: i.amount })),
    };
  }
  const base = (year && month)
    ? (businessId ? payrollBaseSalaryForBiz(emp, businessId, year, month) : payrollBaseSalary(emp, year, month))
    : (emp.baseSalary ?? 0);
  return {
    baseSalary: base,
    holidayQuota: emp.holidayQuota ?? 4,
    commission: 0, holidayWorkDays: 0, holidayDaysTaken: 0, lateDeduction: 0,
    socialSecurity: emp.hasSocialSecurity ? calcSocialSecurity(base) : 0,
    roomFee: emp.roomFee ?? 0,
    paidViaCompany: 0, note: '', status: 'draft', items: [],
  };
}

// ============ PAYROLL PRINT HELPERS (สลิป + รายงานรวม) ============
// escape ข้อความผู้ใช้ก่อนยัดเข้า HTML ของหน้าต่างพิมพ์
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// แปลงจำนวนเงินเป็นข้อความภาษาไทย (บาทอักษร)
function bahtText(num) {
  num = Number(num) || 0;
  const isNeg = num < 0; num = Math.abs(Math.round(num * 100) / 100);
  const baht = Math.floor(num);
  const satang = Math.round((num - baht) * 100);
  const digits = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const readInt = (n) => {
    if (n === 0) return '';
    if (n >= 1000000) {
      const m = Math.floor(n / 1000000), rest = n % 1000000;
      return readInt(m) + 'ล้าน' + (rest > 0 ? readInt(rest) : '');
    }
    const str = String(n), len = str.length; let s = '';
    for (let i = 0; i < len; i++) {
      const d = Number(str[i]); const pos = len - i - 1;
      if (d === 0) continue;
      if (pos === 0 && d === 1 && len > 1) s += 'เอ็ด';
      else if (pos === 1 && d === 2) s += 'ยี่' + units[pos];
      else if (pos === 1 && d === 1) s += units[pos];
      else s += digits[d] + units[pos];
    }
    return s;
  };
  let result;
  if (baht === 0 && satang === 0) result = 'ศูนย์บาทถ้วน';
  else if (baht === 0) result = readInt(satang) + 'สตางค์';
  else result = readInt(baht) + 'บาท' + (satang > 0 ? readInt(satang) + 'สตางค์' : 'ถ้วน');
  return (isNeg ? 'ลบ' : '') + result;
}

// หัวเอกสาร: บริษัท (ชื่อ+ที่อยู่+เลขภาษี) หรือเฉพาะชื่อตลาด ตามที่ตั้งไว้ในแต่ละธุรกิจ
function slipHeaderHtml(business) {
  const logo = business?.logo ? `<img src="${esc(business.logo)}" style="width:62px;height:62px;object-fit:contain;border-radius:8px;flex-shrink:0;" />` : '';
  const useCompany = business?.slipUseCompanyHeader && (business.companyName || business.companyAddress || business.taxId);
  let lines;
  if (useCompany) {
    lines = `<div style="font-family:'Kanit';font-size:19px;font-weight:700;line-height:1.25;">${esc(business.companyName || business.name || '')}</div>`
      + (business.companyAddress ? `<div style="font-size:12.5px;color:#57534e;white-space:pre-line;margin-top:2px;">${esc(business.companyAddress)}</div>` : '')
      + (business.taxId ? `<div style="font-size:12.5px;color:#57534e;">เลขประจำตัวผู้เสียภาษี: ${esc(business.taxId)}</div>` : '');
  } else {
    lines = `<div style="font-family:'Kanit';font-size:19px;font-weight:700;">${esc(business?.name || '')}</div>`;
  }
  return `<div style="display:flex;align-items:center;gap:14px;">${logo}<div>${lines}</div></div>`;
}

// เปิดหน้าต่างพิมพ์ พร้อมฟอนต์ Sarabun/Kanit + สั่ง print อัตโนมัติ
function openPrintHtml(title, inner, pageCss) {
  const w = window.open('', '_blank', 'width=1000,height=1000');
  if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์เอกสาร'); return; }
  w.document.write(`<!DOCTYPE html><html lang="th"><head><meta charset="utf-8" /><title>${esc(title)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&family=Kanit:wght@500;600;700&display=swap" rel="stylesheet" />
    <style>
      *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
      body{font-family:'Sarabun',sans-serif;color:#1c1917;background:#e7e5e4;padding:16px;}
      .doc{background:#fff;margin:0 auto;box-shadow:0 6px 24px rgba(0,0,0,.18);}
      h1,h2,h3{font-family:'Kanit',sans-serif;}
      table{border-collapse:collapse;width:100%;}
      ${pageCss}
      @media print{body{background:#fff;padding:0;}.doc{box-shadow:none;margin:0;}}
    </style></head><body>${inner}
    <script>window.onload=function(){setTimeout(function(){window.print();},450);};</script>
    </body></html>`);
  w.document.close();
}

// สร้าง HTML เนื้อสลิปเงินเดือน 1 ใบ (ใช้ซ้ำได้ทั้งพิมพ์เดี่ยว/หลายใบ)
function payslipInner({ employee, payroll, items, business, position, year, month }) {
  const c = computePayroll(payroll, items || []);
  const m = fmtMoney;
  const period = `${MONTH_NAMES[month - 1]} ${year + 543}`;
  const income = [
    ['เงินเดือนพื้นฐาน', Number(payroll.baseSalary) || 0],
    ['ค่าคอมมิชชั่น', Number(payroll.commission) || 0],
    [`ค่าทำงานวันหยุด (${Number(payroll.holidayWorkDays) || 0} วัน)`, c.holidayWorkPay],
    ...(items || []).filter((i) => i.kind === 'bonus_task').map((i) => [i.label || 'โบนัส/งานพิเศษ', Number(i.amount) || 0]),
  ].filter((r, idx) => idx === 0 || Number(r[1]) > 0);
  const deduct = [
    [`ขาดวันหยุดเกินสิทธิ (${c.excessDays} วัน)`, c.excessHolidayDeduction],
    ['มาสาย', Number(payroll.lateDeduction) || 0],
    ['ประกันสังคม', Number(payroll.socialSecurity) || 0],
    ['ค่าหอพัก', Number(payroll.roomFee) || 0],
    ['จ่ายผ่านบริษัท', Number(payroll.paidViaCompany) || 0],
    ...(items || []).filter((i) => i.kind === 'advance').map((i) => [i.label || 'เบิกล่วงหน้า', Number(i.amount) || 0]),
    ...(items || []).filter((i) => i.kind === 'other_deduction').map((i) => [i.label || 'หักอื่นๆ', Number(i.amount) || 0]),
  ].filter((r) => Number(r[1]) > 0);
  const maxLen = Math.max(income.length, deduct.length);
  const display = dispName(employee);

  return `<div class="doc" style="width:200mm;padding:16mm 14mm;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #065f46;padding-bottom:12px;">
      ${slipHeaderHtml(business)}
      <div style="text-align:right;">
        <div style="font-family:'Kanit';font-size:22px;font-weight:700;color:#065f46;">สลิปเงินเดือน</div>
        <div style="font-size:14px;color:#57534e;">PAY SLIP</div>
        <div style="font-size:13px;margin-top:4px;">งวดเดือน <b>${esc(period)}</b></div>
        <div style="font-size:12px;color:#57534e;">(จ่าย ${esc(payMonthLabel(year, month))})</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px 24px;margin:14px 0 16px;font-size:14px;">
      <div><span style="color:#78716c;">ชื่อพนักงาน:</span> <b>${esc(display)}</b>${employee.nickname && employee.nickname !== employee.name ? ` (${esc(employee.name || '')})` : ''}</div>
      <div><span style="color:#78716c;">รหัสพนักงาน:</span> <b>#${esc(employee.employeeNumber || '—')}</b></div>
      <div><span style="color:#78716c;">ตำแหน่ง:</span> ${esc(position?.name || '—')}</div>
      <div><span style="color:#78716c;">วันที่จ่าย:</span> ${new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
    </div>
    <table style="font-size:13.5px;border:1px solid #e7e5e4;">
      <thead><tr style="background:#065f46;color:#fff;font-family:'Kanit';">
        <th style="padding:8px 10px;text-align:left;width:50%;">รายได้</th><th style="padding:8px 10px;text-align:right;">จำนวน (บาท)</th>
        <th style="padding:8px 10px;text-align:left;width:50%;border-left:2px solid #fff;">รายการหัก</th><th style="padding:8px 10px;text-align:right;">จำนวน (บาท)</th>
      </tr></thead>
      <tbody>${Array.from({ length: maxLen }).map((_, i) => {
        const inc = income[i], ded = deduct[i];
        return `<tr>
          <td style="padding:6px 10px;border-bottom:1px solid #f0eeec;">${inc ? esc(inc[0]) : ''}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0eeec;text-align:right;color:#047857;">${inc ? m(inc[1]) : ''}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0eeec;border-left:1px solid #e7e5e4;">${ded ? esc(ded[0]) : ''}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #f0eeec;text-align:right;color:#b91c1c;">${ded ? m(ded[1]) : ''}</td>
        </tr>`;
      }).join('')}
      <tr style="background:#f5f5f4;font-weight:700;">
        <td style="padding:8px 10px;">รวมรายได้</td><td style="padding:8px 10px;text-align:right;color:#047857;">${m(c.totalIncome)}</td>
        <td style="padding:8px 10px;border-left:1px solid #e7e5e4;">รวมรายการหัก</td><td style="padding:8px 10px;text-align:right;color:#b91c1c;">${m(c.totalDeduction)}</td>
      </tr>
      </tbody>
    </table>
    <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;background:#065f46;color:#fff;border-radius:10px;padding:12px 18px;">
      <div style="font-family:'Kanit';font-size:17px;font-weight:600;">เงินสุทธิที่ได้รับ</div>
      <div style="font-family:'Kanit';font-size:24px;font-weight:700;">${m(c.net)} บาท</div>
    </div>
    <div style="text-align:right;font-size:13px;color:#57534e;margin-top:6px;">(${esc(bahtText(c.net))})</div>
    ${payroll.note ? `<div style="margin-top:12px;font-size:13px;"><span style="color:#78716c;">หมายเหตุ:</span> ${esc(payroll.note)}</div>` : ''}
    <div style="display:flex;justify-content:space-around;margin-top:42px;gap:40px;">
      <div style="text-align:center;font-size:13px;flex:1;"><div style="border-top:1px dotted #78716c;padding-top:6px;">ลงชื่อ ............................................. ผู้จ่ายเงิน</div></div>
      <div style="text-align:center;font-size:13px;flex:1;"><div style="border-top:1px dotted #78716c;padding-top:6px;">ลงชื่อ ............................................. ผู้รับเงิน</div></div>
    </div>
  </div>`;
}

// พิมพ์สลิปเงินเดือนรายคน
function printPayslip(args) {
  const display = dispName(args.employee);
  const period = `${MONTH_NAMES[args.month - 1]} ${args.year + 543}`;
  openPrintHtml(`สลิปเงินเดือน ${display} ${period}`, payslipInner(args), `@page{size:A4;margin:0;}`);
}

// พิมพ์สลิปหลายคนพร้อมกัน (คนละหน้า)
function printPayslips(list, year, month) {
  if (!list || list.length === 0) return;
  const inner = list.map((a, i) => `<div style="${i < list.length - 1 ? 'page-break-after:always;' : ''}">${payslipInner(a)}</div>`).join('');
  openPrintHtml(`สลิปเงินเดือน ${MONTH_NAMES[month - 1]} ${year + 543} (${list.length} ใบ)`, inner, `@page{size:A4;margin:0;}`);
}

// พิมพ์รายงานรวมหน้าเดียว (ทุกคนในธุรกิจ — คนที่ยังไม่ทำเงินเดือนขึ้นว่าง)
function printPayrollRegister({ business, rows, year, month }) {
  const m = fmtMoney;
  const period = `${MONTH_NAMES[month - 1]} ${year + 543}`;
  const cols = ['ฐาน', 'คอมฯ', 'ค่าวันหยุด', 'โบนัส', 'รวมรับ', 'ปกส.', 'ขาด/สาย', 'ค่าหอ', 'เบิก', 'หักอื่น', 'ผ่านบริษัท', 'สุทธิ'];
  const tot = { base: 0, com: 0, hol: 0, bonus: 0, inc: 0, ss: 0, lateAbsent: 0, room: 0, adv: 0, other: 0, viaco: 0, net: 0 };
  const body = rows.map((r, idx) => {
    const e = r.emp;
    if (!r.payroll) {
      return `<tr><td style="padding:5px 6px;border:1px solid #e7e5e4;">${idx + 1}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;">#${esc(e.employeeNumber || '—')}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;">${esc(dispName(e))}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;">${esc(r.position?.name || '—')}</td>
        <td colspan="12" style="padding:5px 6px;border:1px solid #e7e5e4;text-align:center;color:#a8a29e;font-style:italic;">ยังไม่ได้ทำเงินเดือน</td></tr>`;
    }
    const p = r.payroll, c = r.calc;
    const lateAbsent = (Number(p.lateDeduction) || 0) + c.excessHolidayDeduction;
    tot.base += Number(p.baseSalary) || 0; tot.com += Number(p.commission) || 0; tot.hol += c.holidayWorkPay; tot.bonus += c.bonusTasks;
    tot.inc += c.totalIncome; tot.ss += Number(p.socialSecurity) || 0; tot.lateAbsent += lateAbsent; tot.room += Number(p.roomFee) || 0;
    tot.adv += c.advances; tot.other += c.otherDeductions; tot.viaco += Number(p.paidViaCompany) || 0; tot.net += c.net;
    const cell = (v, extra = '') => `<td style="padding:5px 6px;border:1px solid #e7e5e4;text-align:right;${extra}">${m(v)}</td>`;
    return `<tr>
      <td style="padding:5px 6px;border:1px solid #e7e5e4;">${idx + 1}</td>
      <td style="padding:5px 6px;border:1px solid #e7e5e4;">#${esc(e.employeeNumber || '—')}</td>
      <td style="padding:5px 6px;border:1px solid #e7e5e4;white-space:nowrap;">${esc(dispName(e))}</td>
      <td style="padding:5px 6px;border:1px solid #e7e5e4;">${esc(r.position?.name || '—')}</td>
      ${cell(p.baseSalary)}${cell(p.commission)}${cell(c.holidayWorkPay)}${cell(c.bonusTasks)}
      ${cell(c.totalIncome, 'font-weight:600;color:#047857;')}
      ${cell(p.socialSecurity)}${cell(lateAbsent)}${cell(p.roomFee)}${cell(c.advances)}${cell(c.otherDeductions)}${cell(p.paidViaCompany)}
      ${cell(c.net, 'font-weight:700;color:#065f46;')}
    </tr>`;
  }).join('');
  const totCell = (v, extra = '') => `<td style="padding:7px 6px;border:1px solid #d6d3d1;text-align:right;font-weight:700;${extra}">${m(v)}</td>`;
  const inner = `<div class="doc" style="width:287mm;padding:12mm 10mm;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #065f46;padding-bottom:10px;margin-bottom:12px;">
      ${slipHeaderHtml(business)}
      <div style="text-align:right;">
        <div style="font-family:'Kanit';font-size:20px;font-weight:700;color:#065f46;">รายงานสรุปเงินเดือน</div>
        <div style="font-size:13px;margin-top:3px;">งวดเดือน <b>${esc(period)}</b> • พิมพ์ ${new Date().toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
      </div>
    </div>
    <table style="font-size:11.5px;">
      <thead><tr style="background:#065f46;color:#fff;font-family:'Kanit';">
        <th style="padding:7px 6px;border:1px solid #0a7553;">ลำดับ</th>
        <th style="padding:7px 6px;border:1px solid #0a7553;">รหัส</th>
        <th style="padding:7px 6px;border:1px solid #0a7553;text-align:left;">ชื่อ</th>
        <th style="padding:7px 6px;border:1px solid #0a7553;text-align:left;">ตำแหน่ง</th>
        ${cols.map((c) => `<th style="padding:7px 6px;border:1px solid #0a7553;text-align:right;">${c}</th>`).join('')}
      </tr></thead>
      <tbody>${body}
      <tr style="background:#f5f5f4;font-family:'Kanit';">
        <td colspan="4" style="padding:7px 6px;border:1px solid #d6d3d1;font-weight:700;">รวมทั้งสิ้น (${rows.filter((r) => r.payroll).length} คน)</td>
        ${totCell(tot.base)}${totCell(tot.com)}${totCell(tot.hol)}${totCell(tot.bonus)}${totCell(tot.inc, 'color:#047857;')}
        ${totCell(tot.ss)}${totCell(tot.lateAbsent)}${totCell(tot.room)}${totCell(tot.adv)}${totCell(tot.other)}${totCell(tot.viaco)}${totCell(tot.net, 'color:#065f46;')}
      </tr>
      </tbody>
    </table>
    <div style="margin-top:14px;font-size:13px;text-align:right;">รวมจ่ายสุทธิทั้งสิ้น: <b style="font-family:'Kanit';font-size:16px;color:#065f46;">${m(tot.net)} บาท</b></div>
    <div style="font-size:12px;color:#57534e;text-align:right;">(${esc(bahtText(tot.net))})</div>
    <div style="display:flex;justify-content:flex-end;gap:60px;margin-top:36px;font-size:12.5px;">
      <div style="text-align:center;">ลงชื่อ ............................................. ผู้จัดทำ</div>
      <div style="text-align:center;">ลงชื่อ ............................................. ผู้อนุมัติ</div>
    </div>
  </div>`;
  openPrintHtml(`รายงานเงินเดือน ${business?.name || ''} ${period}`, inner, `@page{size:A4 landscape;margin:0;}`);
}

// detect หน้าจอมือถือ
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ============ FILE UPLOAD HELPERS ============
// Upload เอกสารแรงงาน (รูป/PDF) ไปยัง Supabase Storage
// Path เก็บแบบ: businessId/docType-timestamp-random.ext
async function uploadDocument(file, businessId, docType) {
  if (!file) return null;
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `${businessId || 'misc'}/${docType}-${Date.now()}-${rand}.${ext}`;
  const { error } = await supabase.storage.from('employee-docs').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) { alert('อัปโหลดไฟล์ไม่สำเร็จ: ' + error.message); return null; }
  return path;
}

// ลบเอกสารเก่าออกจาก storage
async function deleteDocument(path) {
  if (!path) return;
  await supabase.storage.from('employee-docs').remove([path]);
}

// สร้าง signed URL (expire 1 ชั่วโมง) เพื่อดู/download เอกสาร
async function getDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from('employee-docs').createSignedUrl(path, 3600);
  if (error) { console.error('signed url error:', error); return null; }
  return data.signedUrl;
}

// ============ IMAGE HELPER ============
const resizeImage = (file, maxSize = 400) => new Promise((resolve) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > h && w > maxSize) { h = h * (maxSize / w); w = maxSize; }
      else if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
});

// ============ MAIN APP ============
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const [view, setView] = useState('dashboard');
  const [businesses, setBusinesses] = useState([]);
  const [zones, setZones] = useState([]);
  const [positions, setPositions] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [notiReads, setNotiReads] = useState([]); // [{notificationId, userId}]
  const [expiryWarnMonths, setExpiryWarnMonths] = useState(2); // เตือนก่อนเอกสารหมดอายุกี่เดือน (ตั้งค่าทั้งระบบ)
  const [birthdayNotify, setBirthdayNotify] = useState(true);  // เปิด/ปิด แจ้งเตือนวันเกิด
  const [birthdayWarnDays, setBirthdayWarnDays] = useState(7); // เตือนวันเกิดล่วงหน้ากี่วัน
  const [contractors, setContractors] = useState([]);
  const [contractorVisits, setContractorVisits] = useState([]);

  const [activeBusinessId, setActiveBusinessId] = useState(null);
  const [activeZoneId, setActiveZoneId] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

  // ---- AUTH ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ---- LOAD PROFILE ----
  useEffect(() => {
    if (!session) { setProfile(null); return; }
    (async () => {
      let { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();
      if (error) console.error('Profile load error:', error);
      // self-heal: ถ้าไม่มี profile (เช่นเคยถูกลบ) สร้างใหม่เป็น pending เพื่อไม่ให้ค้าง
      if (!data) {
        const fallbackName = session.user.user_metadata?.name || (session.user.email || '').split('@')[0];
        const { data: created, error: insErr } = await supabase
          .from('user_profiles')
          .insert({ id: session.user.id, name: fallbackName, role: 'pending' })
          .select('*')
          .maybeSingle();
        if (insErr) console.error('Profile self-heal error:', insErr);
        else data = created;
      }
      const p = fromDB(data);
      if (p) {
        p.businessIds = p.businessIds || [];
        p.zoneIds = p.zoneIds || [];
        p.isOwner = p.role === 'owner';
        p.isBM = p.role === 'business_manager';
        p.isZM = p.role === 'zone_manager';
        p.isViewer = p.role === 'viewer';
        p.canWrite = ['owner', 'business_manager', 'zone_manager'].includes(p.role);
        p.canManagePayroll = p.role === 'owner' || (p.role === 'business_manager' && !!p.canManagePayroll);
      }
      setProfile(p);
      if (p?.theme) applyTheme(p.theme);
    })();
  }, [session]);

  // ---- APPLY THEME เมื่อค่าธีมเปลี่ยน ----
  useEffect(() => { applyTheme(profile?.theme); }, [profile?.theme]);

  // ---- LOAD ALL DATA + REALTIME ----
  useEffect(() => {
    if (!profile || profile.role === 'pending') return;

    let cancelled = false;
    setDataLoading(true);
    (async () => {
      const [b, z, p, e, up, noti, reads, settingsRow, contractorsRes, visitsRes] = await Promise.all([
        supabase.from('businesses').select('*').order('created_at'),
        supabase.from('zones').select('*').order('created_at'),
        supabase.from('positions').select('*').order('created_at'),
        supabase.from('employees').select('*').order('created_at'),
        profile.isOwner
          ? supabase.from('user_profiles').select('*, email:id').order('created_at')
          : Promise.resolve({ data: [profile] }),
        supabase.from('notifications').select('*').order('created_at', { ascending: false }),
        supabase.from('notification_reads').select('*'),
        supabase.from('app_settings').select('expiry_warn_months, birthday_notify_enabled, birthday_warn_days').eq('id', 1).maybeSingle(),
        profile.isOwner ? supabase.from('contractors').select('*').order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
        profile.isOwner ? supabase.from('contractor_visits').select('*').order('visit_date', { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      if (cancelled) return;
      if (settingsRow?.data?.expiry_warn_months != null) setExpiryWarnMonths(settingsRow.data.expiry_warn_months);
      if (settingsRow?.data?.birthday_notify_enabled != null) setBirthdayNotify(settingsRow.data.birthday_notify_enabled);
      if (settingsRow?.data?.birthday_warn_days != null) setBirthdayWarnDays(settingsRow.data.birthday_warn_days);
      setContractors(fromDB(contractorsRes?.data) || []);
      setContractorVisits(fromDB(visitsRes?.data) || []);
      setBusinesses(fromDB(b.data || []));
      setZones(fromDB(z.data || []));
      const posRows = fromDB(p.data || []);
      if (!profile.canManagePayroll) posRows.forEach((r) => { delete r.standardSalary; });
      setPositions(posRows);
      const empRows = fromDB(e.data || []);
      if (!profile.canManagePayroll) empRows.forEach((r) => { delete r.baseSalary; delete r.holidayQuota; delete r.hasSocialSecurity; delete r.roomFee; delete r.salarySplit; delete r.commissionPct; delete r.probationSalary; });
      setEmployees(empRows);
      setProfiles(fromDB(up.data || []));
      setNotifications(fromDB(noti.data || []));
      setNotiReads(fromDB(reads.data || []));
      // เลือกธุรกิจเริ่มต้น
      const allBiz = b.data || [];
      const allZones = z.data || [];
      if (!activeBusinessId) {
        if (profile.isOwner) {
          if (allBiz[0]) setActiveBusinessId(allBiz[0].id);
        } else if (profile.isBM && profile.businessIds.length > 0) {
          setActiveBusinessId(profile.businessIds[0]);
        } else if (profile.isZM && profile.zoneIds.length > 0) {
          const zone = allZones.find((zn) => zn.id === profile.zoneIds[0]);
          if (zone) setActiveBusinessId(zone.business_id);
        } else if (allBiz[0]) {
          setActiveBusinessId(allBiz[0].id);
        }
      }
      setDataLoading(false);

      // ---- auto-apply การปรับเงินเดือนที่ถึงกำหนด (owner หรือ หัวหน้าธุรกิจที่มีสิทธิ์) ----
      if (profile.canManagePayroll) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: pending } = await supabase.from('salary_changes')
          .select('*').eq('status', 'pending').lte('effective_date', today);
        if (pending && pending.length > 0 && !cancelled) {
          for (const sc of pending) {
            await supabase.from('employees').update({ base_salary: sc.new_salary }).eq('id', sc.employee_id);
            await supabase.from('salary_changes').update({ status: 'applied', applied_at: new Date().toISOString() }).eq('id', sc.id);
          }
          const { data: e2 } = await supabase.from('employees').select('*').order('created_at');
          if (!cancelled && e2) setEmployees(fromDB(e2));
        }
      }

      // ---- sync notifications (owner เท่านั้น เพราะ insert ถูกจำกัดไว้ที่ owner) ----
      if (profile.isOwner && !cancelled) {
        try {
          const fresh = await syncNotifications();
          if (!cancelled && fresh) setNotifications(fresh);
        } catch (err) { console.error('syncNotifications', err); }
      }
    })();

    // Realtime
    const enrichProfile = (p) => {
      if (!p) return p;
      const out = fromDB(p);
      out.businessIds = out.businessIds || [];
      out.zoneIds = out.zoneIds || [];
      out.isOwner = out.role === 'owner';
      out.isBM = out.role === 'business_manager';
      out.isZM = out.role === 'zone_manager';
      out.isViewer = out.role === 'viewer';
      out.canWrite = ['owner', 'business_manager', 'zone_manager'].includes(out.role);
      out.canManagePayroll = out.role === 'owner' || (out.role === 'business_manager' && !!out.canManagePayroll);
      return out;
    };
    // ตัดข้อมูลตัวเงินสำหรับคนที่ไม่มีสิทธิ์เห็นเงินเดือน (กันรั่วผ่าน realtime — RLS เป็น row-level ไม่ตัดคอลัมน์)
    const stripEmpPay = (r) => { if (!profile.canManagePayroll && r) { delete r.baseSalary; delete r.holidayQuota; delete r.hasSocialSecurity; delete r.roomFee; delete r.salarySplit; delete r.commissionPct; delete r.probationSalary; } return r; };
    const stripPosPay = (r) => { if (!profile.canManagePayroll && r) { delete r.standardSalary; } return r; };
    const handle = (setter, transform) => (payload) => {
      const { eventType, new: nv, old: ov } = payload;
      const map = (row) => (transform ? transform(fromDB(row)) : fromDB(row));
      if (eventType === 'INSERT') {
        setter((prev) => (prev.some((r) => r.id === nv.id) ? prev : [...prev, map(nv)]));
      } else if (eventType === 'UPDATE') {
        setter((prev) => prev.map((r) => (r.id === nv.id ? map(nv) : r)));
        // If current user's profile changed, re-enrich
        if (nv.id === session?.user?.id) setProfile(enrichProfile(nv));
      } else if (eventType === 'DELETE') {
        setter((prev) => prev.filter((r) => r.id !== ov.id));
      }
    };
    const ch = supabase
      .channel('app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'businesses' }, handle(setBusinesses))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, handle(setZones))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, handle(setPositions, stripPosPay))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'employees' }, handle(setEmployees, stripEmpPay))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles' }, handle(setProfiles))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, handle(setNotifications))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notification_reads' }, (payload) => {
        const { eventType, new: nv, old: ov } = payload;
        if (eventType === 'INSERT') setNotiReads((prev) => prev.some((r) => r.notificationId === nv.notification_id && r.userId === nv.user_id) ? prev : [...prev, fromDB(nv)]);
        else if (eventType === 'DELETE') setNotiReads((prev) => prev.filter((r) => !(r.notificationId === ov.notification_id && r.userId === ov.user_id)));
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [profile?.id, profile?.role]);

  // ---- HANDLERS ----
  const changeBusiness = (id) => { setActiveBusinessId(id || null); setActiveZoneId(null); };
  const changeTheme = async (theme) => {
    applyTheme(theme); // เปลี่ยนทันที
    setProfile((prev) => prev ? { ...prev, theme } : prev);
    await supabase.from('user_profiles').update({ theme }).eq('id', session.user.id);
  };
  const openZoneEmployees = (bid, zid) => {
    setActiveBusinessId(bid); setActiveZoneId(zid); setView('employees');
  };

  // ---- สร้าง/อัปเดต notifications (owner client) — reconcile แบบ derived ----
  const syncNotifications = async () => {
    // ดึงข้อมูลล่าสุด
    const [{ data: emps }, { data: poss }, { data: bizs }, { data: zns }, { data: profs }, { data: pendingRaises }, { data: settingsRow }] = await Promise.all([
      supabase.from('employees').select('*'),
      supabase.from('positions').select('*'),
      supabase.from('businesses').select('*'),
      supabase.from('zones').select('*'),
      supabase.from('user_profiles').select('*'),
      supabase.from('salary_changes').select('*').eq('status', 'pending'),
      supabase.from('app_settings').select('expiry_warn_months, birthday_notify_enabled, birthday_warn_days').eq('id', 1).maybeSingle(),
    ]);
    const warnMonths = settingsRow?.expiry_warn_months ?? 2;
    const bdayOn = settingsRow?.birthday_notify_enabled ?? true;
    const bdayDays = settingsRow?.birthday_warn_days ?? 7;
    const E = fromDB(emps || []), P = fromDB(poss || []), B = fromDB(bizs || []), Z = fromDB(zns || []), PR = fromDB(profs || []), SR = fromDB(pendingRaises || []);
    const bizName = (id) => B.find((b) => b.id === id)?.name || '';
    const empName = (id) => { const e = E.find((x) => x.id === id); return e ? (e.nickname || e.name) : ''; };
    const active = E.filter((e) => (e.status || 'active') === 'active');
    const today = new Date();
    const desired = []; // {dedupeKey, businessId, zoneId, type, severity, title, body}

    // 1) ผู้ใช้รออนุมัติ (global → owner)
    PR.filter((p) => p.role === 'pending').forEach((p) => {
      desired.push({ dedupeKey: `pending_user:${p.id}`, businessId: null, zoneId: null, type: 'pending_user', severity: 'warning', title: 'มีผู้ใช้รออนุมัติ', body: `${p.name || p.id} สมัครเข้าระบบ — รอกำหนดสิทธิ์` });
    });
    // 2) เอกสารใกล้หมดอายุ (active) — บัตรแรงงาน / พาสปอร์ต / บัตรประจำตัว
    //    เตือนเมื่อหมดอายุภายใน warnMonths เดือน หรือหมดอายุแล้ว (ตั้งค่าได้ที่หน้า "ตั้งค่า")
    const warnCutoff = new Date(today);
    warnCutoff.setMonth(warnCutoff.getMonth() + warnMonths);
    const docChecks = [
      { type: 'permit_expiry',  title: 'บัตรแรงงานใกล้หมดอายุ',   when: (e) => e.hasWorkPermit && e.workPermitExpiry, date: (e) => e.workPermitExpiry },
      { type: 'passport_expiry', title: 'พาสปอร์ตใกล้หมดอายุ',     when: (e) => e.hasPassport && e.passportExpiry,    date: (e) => e.passportExpiry },
      { type: 'idcard_expiry',   title: 'บัตรประจำตัวใกล้หมดอายุ', when: (e) => !!e.idCardExpiry,                     date: (e) => e.idCardExpiry },
    ];
    docChecks.forEach((dc) => {
      active.filter(dc.when).forEach((e) => {
        const exp = new Date(dc.date(e));
        if (exp <= warnCutoff) {
          const days = Math.ceil((exp - today) / 86400000);
          desired.push({ dedupeKey: `${dc.type}:${e.id}`, businessId: e.businessId, zoneId: e.zoneId, type: dc.type, severity: days < 0 ? 'urgent' : 'warning', title: dc.title, body: `${e.nickname || e.name} — ${days < 0 ? 'หมดอายุแล้ว' : `เหลือ ${days} วัน`}` });
        }
      });
    });
    // 2.5) วันเกิดพนักงาน (เปิด/ปิด + ล่วงหน้ากี่วัน ตั้งค่าได้ที่หน้า "ตั้งค่า")
    if (bdayOn) {
      const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      active.filter((e) => e.birthDate).forEach((e) => {
        const bd = new Date(e.birthDate);
        if (isNaN(bd)) return;
        let next = new Date(startOfToday.getFullYear(), bd.getMonth(), bd.getDate());
        if (next < startOfToday) next = new Date(startOfToday.getFullYear() + 1, bd.getMonth(), bd.getDate());
        const days = Math.round((next - startOfToday) / 86400000);
        if (days <= bdayDays) {
          const dd = String(bd.getDate()).padStart(2, '0'), mm = String(bd.getMonth() + 1).padStart(2, '0');
          desired.push({ dedupeKey: `birthday:${e.id}:${next.getFullYear()}`, businessId: e.businessId, zoneId: e.zoneId, type: 'birthday', severity: 'info', title: 'วันเกิดพนักงาน', body: `${e.nickname || e.name} — ${days === 0 ? 'วันนี้วันเกิด! 🎂' : `อีก ${days} วัน (${dd}/${mm})`}` });
        }
      });
    }
    // 3) ตำแหน่งว่าง (ต่อโซน: มีคนลาออกแต่ไม่เหลือ active)
    Z.forEach((zone) => {
      const inZone = E.filter((e) => e.zoneId === zone.id);
      const byPos = {};
      inZone.forEach((e) => { if (e.positionId) (byPos[e.positionId] ||= []).push(e); });
      Object.entries(byPos).forEach(([posId, list]) => {
        const act = list.filter((e) => (e.status || 'active') === 'active').length;
        const resigned = list.filter((e) => (e.status || 'active') !== 'active');
        if (act === 0 && resigned.length > 0) {
          const pos = P.find((p) => p.id === posId);
          desired.push({ dedupeKey: `vacancy:${posId}:${zone.id}`, businessId: zone.businessId, zoneId: zone.id, type: 'vacancy', severity: 'warning', title: 'ตำแหน่งว่าง', body: `${pos?.name || 'ตำแหน่ง'} (${zone.name}) ไม่มีคนทำงาน` });
        }
      });
    });
    // 4/5) ขาด/เกินอัตรากำลัง (ต่อตำแหน่ง รวมทั้งธุรกิจ)
    P.forEach((pos) => {
      const target = pos.targetHeadcount || 0;
      if (target <= 0) return;
      const count = active.filter((e) => businessPositionId(e, pos.businessId) === pos.id).length;
      if (count < target) desired.push({ dedupeKey: `understaffed:${pos.id}`, businessId: pos.businessId, zoneId: null, type: 'understaffed', severity: 'warning', title: 'ตำแหน่งขาดคน', body: `${pos.name} — มี ${count}/${target} ขาดอีก ${target - count} คน` });
      else if (count > target) desired.push({ dedupeKey: `overstaffed:${pos.id}`, businessId: pos.businessId, zoneId: null, type: 'overstaffed', severity: 'info', title: 'ตำแหน่งมีคนเกิน', body: `${pos.name} — มี ${count}/${target} เกิน ${count - target} คน` });
    });
    // 6) เงินเดือนยังไม่ปิดงวด (เฉพาะใกล้สิ้นเดือน วันที่ >= 25)
    if (today.getDate() >= 25) {
      const yr = today.getFullYear(), mo = today.getMonth() + 1;
      const { data: pys } = await supabase.from('payrolls').select('employee_id,business_id,status').eq('period_year', yr).eq('period_month', mo);
      const finalizedByBiz = {};
      (pys || []).forEach((p) => { if (p.status === 'finalized') (finalizedByBiz[p.business_id] ||= new Set()).add(p.employee_id); });
      B.forEach((biz) => {
        const need = active.filter((e) => e.businessId === biz.id && Number(e.baseSalary) > 0);
        const done = finalizedByBiz[biz.id] || new Set();
        const remaining = need.filter((e) => !done.has(e.id)).length;
        if (need.length > 0 && remaining > 0) {
          desired.push({ dedupeKey: `payroll_incomplete:${biz.id}:${yr}-${mo}`, businessId: biz.id, zoneId: null, type: 'payroll_incomplete', severity: 'warning', title: 'เงินเดือนยังไม่ปิดงวด', body: `${biz.name} — เดือน ${MONTH_NAMES[mo - 1]} ยังไม่ปิดงวด ${remaining} คน` });
        }
      });
    }
    // 7) เงินเดือนรอมีผล
    SR.forEach((sc) => {
      const d = sc.effectiveDate ? new Date(sc.effectiveDate) : null;
      const monthLabel = d ? `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear() + 543}` : '';
      desired.push({ dedupeKey: `pending_raise:${sc.id}`, businessId: sc.businessId, zoneId: null, type: 'pending_raise', severity: 'info', title: 'ปรับเงินเดือนรอมีผล', body: `${empName(sc.employeeId)} → ${fmtMoney(sc.newSalary)} ฿ (มีผล ${monthLabel})` });
    });

    // reconcile: ลบของเก่าที่ไม่อยู่ในชุดปัจจุบัน + insert ที่ขาด
    const { data: existing } = await supabase.from('notifications').select('id,dedupe_key');
    const existKeys = new Set((existing || []).map((n) => n.dedupe_key));
    const desiredKeys = new Set(desired.map((d) => d.dedupeKey));
    const toDelete = (existing || []).filter((n) => !desiredKeys.has(n.dedupe_key));
    const toInsert = desired.filter((d) => !existKeys.has(d.dedupeKey));
    if (toDelete.length > 0) await supabase.from('notifications').delete().in('id', toDelete.map((n) => n.id));
    if (toInsert.length > 0) await supabase.from('notifications').insert(toInsert.map((d) => toDB(d)));
    const { data: finalNoti } = await supabase.from('notifications').select('*').order('created_at', { ascending: false });
    return fromDB(finalNoti || []);
  };

  // แปลง error ของ DB ให้เป็นข้อความที่อ่านง่าย (เช่น เลขพนักงานซ้ำ = unique violation 23505)
  const friendlyDBError = (error, fallback) => {
    if (error?.code === '23505' && /employee_number/.test(error?.message || '')) {
      return 'เลขพนักงานนี้ซ้ำกับคนอื่นในระบบ กรุณาใช้เลขอื่น หรือเว้นว่างไว้เพื่อให้ระบบรันเลขให้อัตโนมัติ';
    }
    return fallback + (error?.message || '');
  };

  // CRUD: generic
  const insertRow = async (table, data) => {
    const { data: row, error } = await supabase.from(table).insert(toDB(data)).select().single();
    if (error) { alert(friendlyDBError(error, 'บันทึกไม่สำเร็จ: ')); return null; }
    return fromDB(row);
  };
  const updateRow = async (table, id, data) => {
    const { error } = await supabase.from(table).update(toDB(data)).eq('id', id);
    if (error) { alert(friendlyDBError(error, 'แก้ไขไม่สำเร็จ: ')); return false; }
    return true;
  };
  const deleteRow = async (table, id) => {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return false; }
    return true;
  };

  const ops = {
    business: {
      add: async (d) => { const r = await insertRow('businesses', d); if (r && !activeBusinessId) setActiveBusinessId(r.id); },
      update: (id, d) => updateRow('businesses', id, d),
      delete: (id) => deleteRow('businesses', id),
    },
    zone: {
      add: (d) => insertRow('zones', d),
      update: (id, d) => updateRow('zones', id, d),
      delete: (id) => deleteRow('zones', id),
    },
    position: {
      add: (d) => insertRow('positions', d),
      update: (id, d) => updateRow('positions', id, d),
      delete: (id) => deleteRow('positions', id),
    },
    employee: {
      add: (d) => insertRow('employees', d),
      update: (id, d) => updateRow('employees', id, d),
      delete: (id) => deleteRow('employees', id),
      resign: (id, d) => updateRow('employees', id, { status: 'resigned', resignedDate: d.resignedDate, resignReason: d.resignReason, resignNote: d.resignNote }),
      rehire: (id) => updateRow('employees', id, { status: 'active', resignedDate: null, resignReason: null, resignNote: null }),
    },
    profile: {
      update: (id, d) => updateRow('user_profiles', id, d),
      delete: (id) => deleteRow('user_profiles', id),
    },
    payroll: {
      listByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('payrolls').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month);
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('payrolls')
          .upsert(toDB(d), { onConflict: 'employee_id,business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
      update: (id, d) => updateRow('payrolls', id, d),
      delete: (id) => deleteRow('payrolls', id),
    },
    payrollItem: {
      listByPayrolls: async (ids) => {
        if (!ids.length) return [];
        const { data, error } = await supabase.from('payroll_items').select('*').in('payroll_id', ids);
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      distinctLabels: async (kind) => {
        const { data, error } = await supabase.from('payroll_items').select('label').eq('kind', kind).limit(1000);
        if (error) { console.error(error); return []; }
        return [...new Set((data || []).map((r) => r.label).filter((l) => l && l !== '-'))];
      },
      add: (d) => insertRow('payroll_items', d),
      delete: (id) => deleteRow('payroll_items', id),
    },
    commission: {
      getByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('commission_pools').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('commission_pools')
          .upsert({ ...toDB(d), updated_at: new Date().toISOString() }, { onConflict: 'business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกคอมไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    roomRent: {
      getByPeriod: async (businessId, year, month) => {
        const { data, error } = await supabase.from('room_rent_pools').select('*')
          .eq('business_id', businessId).eq('period_year', year).eq('period_month', month).maybeSingle();
        if (error) { console.error(error); return null; }
        return data ? fromDB(data) : null;
      },
      upsert: async (d) => {
        const { data, error } = await supabase.from('room_rent_pools')
          .upsert({ ...toDB(d), updated_at: new Date().toISOString() }, { onConflict: 'business_id,period_year,period_month' })
          .select().single();
        if (error) { alert('บันทึกค่าห้องไม่สำเร็จ: ' + error.message); return null; }
        return fromDB(data);
      },
    },
    salaryChange: {
      listByEmployee: async (employeeId) => {
        const { data, error } = await supabase.from('salary_changes').select('*')
          .eq('employee_id', employeeId).order('effective_date', { ascending: false });
        if (error) { console.error(error); return []; }
        return fromDB(data || []);
      },
      add: (d) => insertRow('salary_changes', d),
      delete: (id) => deleteRow('salary_changes', id),
    },
    notification: {
      markRead: async (notificationId, userId) => {
        const { error } = await supabase.from('notification_reads').upsert({ notification_id: notificationId, user_id: userId }, { onConflict: 'notification_id,user_id' });
        if (error) console.error(error);
      },
      markAllRead: async (notificationIds, userId) => {
        if (!notificationIds.length) return;
        const rows = notificationIds.map((id) => ({ notification_id: id, user_id: userId }));
        const { error } = await supabase.from('notification_reads').upsert(rows, { onConflict: 'notification_id,user_id' });
        if (error) console.error(error);
      },
      markUnread: async (notificationId, userId) => {
        const { error } = await supabase.from('notification_reads').delete().eq('notification_id', notificationId).eq('user_id', userId);
        if (error) console.error(error);
      },
    },
    settings: {
      // อัปเดตค่าตั้งค่าทั้งระบบ (owner เท่านั้นตาม RLS)
      update: async (patch) => {
        const { error } = await supabase.from('app_settings').update({ ...toDB(patch), updated_at: new Date().toISOString() }).eq('id', 1);
        if (error) { alert('บันทึกการตั้งค่าไม่สำเร็จ: ' + error.message); return false; }
        return true;
      },
    },
    contractor: {
      add: (d) => insertRow('contractors', d),
      update: (id, d) => updateRow('contractors', id, d),
      del: async (id) => {
        // ลบไฟล์เอกสารของทุก visit ที่ผูกกับช่างคนนี้ก่อน
        const myVisits = contractorVisits.filter((v) => v.contractorId === id);
        const allDocs = myVisits.flatMap((v) => v.docs || []);
        await Promise.all(allDocs.map((p) => deleteDocument(p)));
        const { error } = await supabase.from('contractors').delete().eq('id', id);
        if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return false; }
        return true;
      },
    },
    contractorVisit: {
      add: (d) => insertRow('contractor_visits', d),
      update: (id, d) => updateRow('contractor_visits', id, d),
      del: async (id) => {
        const v = contractorVisits.find((x) => x.id === id);
        await Promise.all((v?.docs || []).map((p) => deleteDocument(p)));
        const { error } = await supabase.from('contractor_visits').delete().eq('id', id);
        if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return false; }
        return true;
      },
    },
  };

  if (authLoading) return <LoadingScreen />;
  if (!session) return <AuthScreen />;
  if (!profile) return <LoadingScreen msg="กำลังโหลดโปรไฟล์..." />;
  if (profile.role === 'pending') return <PendingScreen profile={profile} />;
  if (dataLoading) return <LoadingScreen msg="กำลังโหลดข้อมูล..." />;

  return (
    <div className="min-h-screen bg-stone-50 lg:flex">
      {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-stone-900/50 z-40 lg:hidden" />}
      <Sidebar
        view={view}
        setView={setView}
        profile={profile}
        businesses={businesses}
        zones={zones}
        activeBusinessId={activeBusinessId}
        setActiveBusinessId={changeBusiness}
        onThemeChange={changeTheme}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        notiBell={
          <NotificationBell
            notifications={notifications}
            notiReads={notiReads}
            userId={session.user.id}
            canManagePayroll={profile.canManagePayroll}
            ops={ops}
            onJump={(n) => {
              if (n.type === 'pending_user') setView('users');
              else if (n.type === 'payroll_incomplete' || n.type === 'pending_raise') { if (n.businessId) changeBusiness(n.businessId); setView(n.type === 'payroll_incomplete' ? 'payroll' : 'employees'); }
              else if (n.type === 'permit_expiry' || n.type === 'passport_expiry' || n.type === 'idcard_expiry' || n.type === 'birthday' || n.type === 'vacancy') { if (n.businessId) changeBusiness(n.businessId); setView('employees'); }
              else { if (n.businessId) changeBusiness(n.businessId); setView('positions'); }
            }}
          />
        }
      />
      <main className="flex-1 min-w-0 h-screen flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center gap-2 px-3 py-2 bg-white/95 backdrop-blur border-b border-stone-200 z-30">
          <button onClick={() => setSidebarOpen((o) => !o)} className="p-2 rounded-lg hover:bg-stone-100 text-stone-600" title="แสดง/ซ่อนเมนู" aria-label="เมนู"><Menu className="w-5 h-5" /></button>
          <div className="w-7 h-7 rounded-md bg-amber-500 flex items-center justify-center lg:hidden"><Users className="w-4 h-4 text-emerald-950" strokeWidth={2.5} /></div>
          <span className="font-semibold text-stone-700 text-sm lg:hidden">ระบบพนักงาน</span>
        </div>
        <div className="flex-1 min-h-0">
        {view === 'dashboard' && (
          <Dashboard
            profile={profile}
            businesses={businesses}
            zones={zones}
            employees={employees}
            positions={positions}
            activeBusinessId={activeBusinessId}
            setView={setView}
          />
        )}
        {view === 'businesses' && (profile.isOwner || profile.isBM) && (
          <BusinessesPage
            businesses={businesses}
            zones={zones}
            employees={employees}
            positions={positions}
            profile={profile}
            ops={ops}
            activeBusinessId={activeBusinessId}
            setActiveBusinessId={changeBusiness}
            onOpenZone={openZoneEmployees}
          />
        )}
        {view === 'positions' && (
          <PositionsPage
            businesses={businesses}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'employees' && (
          <EmployeesPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
            activeZoneId={activeZoneId}
            setActiveZoneId={setActiveZoneId}
            ops={ops}
          />
        )}
        {view === 'orgchart' && (
          <OrgChartPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            profile={profile}
            activeBusinessId={activeBusinessId}
          />
        )}
        {view === 'payroll' && profile.canManagePayroll && (
          <PayrollPage
            businesses={businesses}
            zones={zones}
            positions={positions}
            employees={employees}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'commission' && profile.canManagePayroll && (
          <CommissionPage
            businesses={businesses}
            employees={employees}
            positions={positions}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'roomrent' && profile.canManagePayroll && (
          <RoomRentPage
            businesses={businesses}
            employees={employees}
            activeBusinessId={activeBusinessId}
            ops={ops}
          />
        )}
        {view === 'users' && profile.isOwner && (
          <UsersPage
            profiles={profiles}
            businesses={businesses}
            zones={zones}
            ops={ops}
            currentUserId={session.user.id}
          />
        )}
        {view === 'contractors' && profile.isOwner && (
          <ContractorsPage
            contractors={contractors}
            visits={contractorVisits}
            businesses={businesses}
            ops={ops}
          />
        )}
        {view === 'settings' && profile.isOwner && (
          <SettingsPage
            expiryWarnMonths={expiryWarnMonths}
            birthdayNotify={birthdayNotify}
            birthdayWarnDays={birthdayWarnDays}
            ops={ops}
            onSaved={(m) => setExpiryWarnMonths(m)}
            onSavedBirthday={(en, d) => { setBirthdayNotify(en); setBirthdayWarnDays(d); }}
          />
        )}
        </div>
      </main>
    </div>
  );
}

// ============ LOADING ============
function LoadingScreen({ msg = 'กำลังโหลด...' }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <div className="text-stone-500">{msg}</div>
    </div>
  );
}

// ============ AUTH SCREEN ============
function AuthScreen() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState('');

  const handleSubmit = async () => {
    setError(''); setInfo(''); setBusy(true);
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { data: { name: name || email.split('@')[0] } },
        });
        if (error) throw error;
        setInfo('สมัครสำเร็จ! ถ้า Supabase ตั้งให้ยืนยันอีเมล กรุณาเช็คอีเมล มิฉะนั้นเข้าสู่ระบบได้เลย');
      }
    } catch (e) {
      setError(e.message || 'เกิดข้อผิดพลาด');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-emerald-900 to-stone-900 p-6">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500 mb-4 shadow-lg shadow-amber-500/30">
            <Users className="w-8 h-8 text-emerald-950" strokeWidth={2.5} />
          </div>
          <h1 className="text-4xl font-bold text-white tracking-tight">ระบบจัดการพนักงาน</h1>
          <p className="text-emerald-200/70 mt-2 text-sm">Employee Management System</p>
        </div>
        <div onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} className="bg-white/95 backdrop-blur rounded-2xl shadow-2xl p-8 border border-white/20">
          <div className="flex gap-1 p-1 bg-stone-100 rounded-lg mb-6">
            <button onClick={() => setMode('login')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'login' ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-500'}`}>เข้าสู่ระบบ</button>
            <button onClick={() => setMode('signup')} className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${mode === 'signup' ? 'bg-white text-emerald-900 shadow-sm' : 'text-stone-500'}`}>สมัครสมาชิก</button>
          </div>
          <div className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">ชื่อ-นามสกุล</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="คุณ A" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">อีเมล</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-3 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="you@example.com" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-10 py-2.5 bg-stone-50 border border-stone-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="••••••••" />
                <button onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'signup' && <p className="text-xs text-stone-500 mt-1">อย่างน้อย 6 ตัวอักษร</p>}
            </div>
            {error && <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}
            {info && <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /><span>{info}</span></div>}
            <button onClick={handleSubmit} disabled={busy} className="w-full py-2.5 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-lg shadow-emerald-900/20">
              {busy ? 'กำลังดำเนินการ...' : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </button>
          </div>
          {mode === 'signup' && (
            <div className="mt-5 text-xs text-stone-500 text-center">
              คนแรกที่สมัครจะเป็นเจ้าของระบบโดยอัตโนมัติ <br />คนถัดไปจะรอเจ้าของอนุมัติ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PENDING SCREEN ============
function PendingScreen({ profile }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="max-w-md text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-100 mb-4">
          <Clock className="w-8 h-8 text-amber-700" />
        </div>
        <h2 className="text-xl font-semibold text-stone-800">รออนุมัติ</h2>
        <p className="text-stone-600 mt-2">บัญชีของคุณ ({profile.name}) ได้รับการสร้างแล้ว แต่ยังรอเจ้าของระบบอนุมัติและกำหนดสิทธิ์</p>
        <button onClick={() => supabase.auth.signOut()} className="mt-6 px-4 py-2 text-sm text-stone-700 hover:bg-stone-200 rounded-lg">ออกจากระบบ</button>
      </div>
    </div>
  );
}

// ============ NOTIFICATION BELL ============
const NOTI_META = {
  pending_user:       { icon: UserCircle, color: 'text-amber-600 bg-amber-100' },
  permit_expiry:      { icon: CreditCard, color: 'text-red-600 bg-red-100' },
  passport_expiry:    { icon: BookOpen, color: 'text-red-600 bg-red-100' },
  idcard_expiry:      { icon: Shield, color: 'text-red-600 bg-red-100' },
  birthday:           { icon: Calendar, color: 'text-pink-600 bg-pink-100' },
  vacancy:            { icon: Award, color: 'text-amber-600 bg-amber-100' },
  understaffed:       { icon: Users, color: 'text-rose-600 bg-rose-100' },
  overstaffed:        { icon: Users, color: 'text-sky-600 bg-sky-100' },
  payroll_incomplete: { icon: Wallet, color: 'text-amber-600 bg-amber-100' },
  pending_raise:      { icon: TrendingUp, color: 'text-emerald-600 bg-emerald-100' },
};
function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (s < 60) return 'เมื่อสักครู่';
  if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
  if (s < 86400) return `${Math.floor(s / 3600)} ชม.ที่แล้ว`;
  return `${Math.floor(s / 86400)} วันที่แล้ว`;
}
function NotificationBell({ notifications, notiReads, userId, canManagePayroll, ops, onJump }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const readSet = useMemo(() => new Set(notiReads.filter((r) => r.userId === userId).map((r) => r.notificationId)), [notiReads, userId]);
  // ซ่อนการแจ้งเตือนที่เกี่ยวกับเงินเดือน จากผู้ที่ไม่มีสิทธิ์ดูเงินเดือน
  const PAYROLL_NOTI = ['payroll_incomplete', 'pending_raise'];
  const visibleNoti = useMemo(() => (canManagePayroll ? notifications : notifications.filter((n) => !PAYROLL_NOTI.includes(n.type))), [notifications, canManagePayroll]);
  const sorted = useMemo(() => [...visibleNoti].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [visibleNoti]);
  const unread = sorted.filter((n) => !readSet.has(n.id));
  const unreadCount = unread.length;

  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const clickNoti = (n) => {
    if (!readSet.has(n.id)) ops.notification.markRead(n.id, userId);
    if (onJump) onJump(n);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="relative p-2 rounded-lg hover:bg-emerald-900 text-emerald-100/90 transition-colors" title="การแจ้งเตือน">
        {unreadCount > 0 ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 w-[340px] max-w-[90vw] bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between bg-stone-50">
            <div className="font-semibold text-stone-800 text-sm">การแจ้งเตือน {unreadCount > 0 && <span className="text-red-500">({unreadCount})</span>}</div>
            {unreadCount > 0 && (
              <button onClick={() => ops.notification.markAllRead(unread.map((n) => n.id), userId)} className="flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-medium"><CheckCheck className="w-3.5 h-3.5" />อ่านทั้งหมด</button>
            )}
          </div>
          <div className="max-h-[420px] overflow-auto">
            {sorted.length === 0 ? (
              <div className="px-4 py-10 text-center text-stone-400 text-sm"><Bell className="w-8 h-8 mx-auto mb-2 opacity-40" />ไม่มีการแจ้งเตือน</div>
            ) : (
              sorted.map((n) => {
                const meta = NOTI_META[n.type] || { icon: Bell, color: 'text-stone-600 bg-stone-100' };
                const Icon = meta.icon;
                const isUnread = !readSet.has(n.id);
                return (
                  <button key={n.id} onClick={() => clickNoti(n)} className={`w-full text-left px-4 py-3 flex items-start gap-3 border-b border-stone-100 hover:bg-stone-50 transition-colors ${isUnread ? 'bg-emerald-50/40' : ''}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}><Icon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm truncate ${isUnread ? 'font-semibold text-stone-800' : 'font-medium text-stone-600'}`}>{n.title}</span>
                        {isUnread && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />}
                      </div>
                      {n.body && <div className="text-xs text-stone-500 mt-0.5 break-words">{n.body}</div>}
                      <div className="text-[11px] text-stone-400 mt-1">{timeAgo(n.createdAt)}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============ THEME PICKER ============
function ThemePicker({ current, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);
  const cur = THEMES.find((t) => t.value === current) || THEMES[0];
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
        <div className="flex -space-x-1">
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.primary }} />
          <span className="w-4 h-4 rounded-full border border-emerald-950" style={{ background: cur.accent }} />
        </div>
        <span className="flex-1 text-left">ธีม: {cur.label}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-full bg-white rounded-xl shadow-2xl border border-stone-200 z-[70] overflow-hidden p-1.5">
          <div className="px-2 py-1.5 text-xs font-medium text-stone-400">เลือกธีมสี</div>
          {THEMES.map((t) => {
            const active = t.value === current;
            return (
              <button key={t.value} onClick={() => { onSelect(t.value); setOpen(false); }} className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-colors ${active ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
                <div className="flex -space-x-1 flex-shrink-0">
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.primary }} />
                  <span className="w-5 h-5 rounded-full border-2 border-white shadow-sm" style={{ background: t.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-stone-800">{t.label}</div>
                  <div className="text-[11px] text-stone-500">{t.desc}</div>
                </div>
                {active && <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ SIDEBAR ============
function Sidebar({ view, setView, profile, businesses, zones, activeBusinessId, setActiveBusinessId, notiBell, onThemeChange, open, onClose }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const canManageBiz = isOwner || isBM;
  const roleLabel = isOwner ? 'เจ้าของระบบ' : isBM ? 'หัวหน้าธุรกิจ' : isZM ? 'หัวหน้าโซน' : isViewer ? 'ผู้ดู' : 'รออนุมัติ';
  const RoleIcon = isOwner ? Crown : isViewer ? Eye : User;
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'ภาพรวม', icon: Home },
    { id: 'businesses', label: 'ธุรกิจและโซน', icon: Building2, show: canManageBiz },
    { id: 'positions', label: 'ตำแหน่ง', icon: Award },
    { id: 'employees', label: 'พนักงาน', icon: Users },
    { id: 'orgchart', label: 'แผนผังองค์กร', icon: Network },
    { id: 'payroll', label: 'เงินเดือน', icon: Wallet, show: profile.canManagePayroll },
    { id: 'commission', label: 'คอมมิชชั่น', icon: Percent, show: profile.canManagePayroll },
    { id: 'roomrent', label: 'ค่าห้องพนักงาน', icon: KeyRound, show: profile.canManagePayroll },
    { id: 'users', label: 'ผู้ใช้ระบบ', icon: Shield, show: isOwner },
    { id: 'contractors', label: 'ช่าง/ผู้รับเหมา', icon: Wrench, show: isOwner },
    { id: 'settings', label: 'ตั้งค่า', icon: Settings, show: isOwner },
  ];

  // ธุรกิจที่ user เลือกได้
  const accessibleBiz = (() => {
    if (isOwner) return businesses;
    if (isBM) return businesses.filter((b) => (profile.businessIds || []).includes(b.id));
    if (isZM) {
      const bizIds = new Set((zones || []).filter((z) => (profile.zoneIds || []).includes(z.id)).map((z) => z.businessId));
      return businesses.filter((b) => bizIds.has(b.id));
    }
    if (isViewer) {
      const hasScope = profile.businessIds.length > 0 || profile.zoneIds.length > 0;
      if (!hasScope) return businesses;
      const bizIds = new Set([
        ...profile.businessIds,
        ...(zones || []).filter((z) => profile.zoneIds.includes(z.id)).map((z) => z.businessId),
      ]);
      return businesses.filter((b) => bizIds.has(b.id));
    }
    return businesses;
  })();

  const navClick = (id) => {
    setView(id);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) onClose?.();
  };

  return (
    <aside className={`w-64 bg-emerald-950 text-emerald-50 flex flex-col h-screen z-50 transition-transform duration-200 ease-out
      fixed inset-y-0 left-0 ${open ? 'translate-x-0' : '-translate-x-full'}
      lg:static lg:z-auto lg:translate-x-0 ${open ? 'lg:flex' : 'lg:hidden'}`}>
      <div className="p-5 border-b border-emerald-900">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-950" strokeWidth={2.5} />
          </div>
          <div className="flex-1">
            <div className="font-semibold text-white text-sm">ระบบพนักงาน</div>
            <div className="text-xs text-emerald-300/70">Employee System</div>
          </div>
          {notiBell}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-emerald-900 text-emerald-100/80 lg:hidden" aria-label="ปิดเมนู"><X className="w-5 h-5" /></button>
        </div>
      </div>
      {(() => {
        const activeBiz = activeBusinessId ? businesses.find((b) => b.id === activeBusinessId) : null;
        if (!activeBiz) return null;
        return (
          <div className="px-3 pt-3">
            <div className="flex items-center gap-2.5 px-2.5 py-2 bg-emerald-900/60 rounded-lg">
              <div className="w-9 h-9 rounded-lg bg-white/95 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {activeBiz.logo ? <img src={activeBiz.logo} alt={activeBiz.name} className="w-full h-full object-contain" /> : <Building2 className="w-5 h-5 text-emerald-800" />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] text-emerald-300/70">ธุรกิจที่กำลังดู</div>
                <div className="text-sm text-white font-medium truncate">{activeBiz.name}</div>
              </div>
            </div>
          </div>
        );
      })()}
      {accessibleBiz.length > 1 && (
        <div className="p-3 border-b border-emerald-900">
          <label className="block text-xs text-emerald-300/70 mb-1.5 px-1">เปลี่ยนธุรกิจ</label>
          <select value={activeBusinessId || ''} onChange={(e) => setActiveBusinessId(e.target.value)} className="w-full px-3 py-2 bg-emerald-900 border border-emerald-800 rounded-lg text-sm text-white focus:outline-none focus:border-amber-500">
            {isOwner && <option value="">🌐 ทุกธุรกิจ (ภาพรวม)</option>}
            {accessibleBiz.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      )}
      <nav className="flex-1 p-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          if (item.show === false) return null;
          const Icon = item.icon;
          const active = view === item.id;
          return (
            <button key={item.id} onClick={() => navClick(item.id)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${active ? 'bg-amber-500 text-emerald-950 font-medium shadow-lg shadow-amber-500/20' : 'text-emerald-100/80 hover:bg-emerald-900 hover:text-white'}`}>
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-emerald-900">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          <div className="w-9 h-9 rounded-full bg-emerald-800 flex items-center justify-center">
            <RoleIcon className={`w-4 h-4 ${isOwner ? 'text-amber-400' : 'text-emerald-200'}`} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{profile.name || 'ผู้ใช้'}</div>
            <div className="text-xs text-emerald-300/70">{roleLabel}</div>
          </div>
        </div>
        <ThemePicker current={profile.theme} onSelect={onThemeChange} />
        <button onClick={() => supabase.auth.signOut()} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-100/80 hover:bg-emerald-900 hover:text-white transition-colors">
          <LogOut className="w-4 h-4" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    </aside>
  );
}

// ============ PAGE HEADER ============
function PageHeader({ title, subtitle, children }) {
  return (
    <div className="bg-white border-b border-stone-200 px-8 py-5 flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-stone-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-[15px] text-stone-500 mt-1">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

// ============ DASHBOARD ============
function Dashboard({ profile, businesses, zones, employees, positions, activeBusinessId, setView }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const visibleEmployees = useMemo(() => {
    const act = employees.filter(isActive);
    if (isOwner) return activeBusinessId
      ? act.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
      : act;
    if (isBM) {
      const ids = profile.businessIds || [];
      let list = act.filter((e) => ids.includes(e.businessId) || (e.additionalBusinessIds || []).some((id) => ids.includes(id)));
      if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId));
      return list;
    }
    if (isZM) {
      const zoneIds = profile.zoneIds || [];
      return act.filter((e) => zoneIds.includes(e.zoneId));
    }
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return activeBusinessId ? act.filter((e) => e.businessId === activeBusinessId) : act;
      return act.filter((e) => profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId));
    }
    return [];
  }, [employees, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);
  const visibleZones = useMemo(() => {
    if (isOwner) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
    if (isBM) return zones.filter((z) => (profile.businessIds || []).includes(z.businessId));
    if (isZM) return zones.filter((z) => (profile.zoneIds || []).includes(z.id));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return zones;
      return zones.filter((z) => profile.businessIds.includes(z.businessId) || profile.zoneIds.includes(z.id));
    }
    return [];
  }, [zones, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);

  // ตำแหน่งว่าง: ตำแหน่งที่มีคนลาออก แต่ไม่มีคน active อยู่แล้ว
  const vacancies = useMemo(() => {
    const scopeEmp = (() => {
      if (isOwner) return activeBusinessId ? employees.filter((e) => e.businessId === activeBusinessId) : employees;
      if (isBM) return employees.filter((e) => (profile.businessIds || []).includes(e.businessId));
      if (isZM) return employees.filter((e) => (profile.zoneIds || []).includes(e.zoneId));
      return [];
    })();
    const result = [];
    visibleZones.forEach((zone) => {
      const inZone = scopeEmp.filter((e) => e.zoneId === zone.id);
      const byPos = {};
      inZone.forEach((e) => { if (e.positionId) (byPos[e.positionId] ||= []).push(e); });
      Object.entries(byPos).forEach(([posId, list]) => {
        const activeCount = list.filter(isActive).length;
        const resignedList = list.filter((e) => !isActive(e));
        if (activeCount === 0 && resignedList.length > 0) {
          const pos = positions.find((p) => p.id === posId);
          const lastResigned = resignedList.slice().sort((a, b) => (b.resignedDate || '').localeCompare(a.resignedDate || ''))[0];
          result.push({ zone, position: pos, lastResigned });
        }
      });
    });
    return result;
  }, [employees, visibleZones, positions, isOwner, isBM, isZM, profile, activeBusinessId]);

  // ตำแหน่งที่อัตรากำลังไม่ตรง (นับรวมทั้งธุรกิจ): ขาด หรือ เกิน
  const staffingIssues = useMemo(() => {
    const scopePos = (() => {
      if (isOwner) return activeBusinessId ? positions.filter((p) => p.businessId === activeBusinessId) : positions;
      if (isBM) return positions.filter((p) => (profile.businessIds || []).includes(p.businessId));
      return [];
    })();
    const under = [], over = [];
    scopePos.forEach((pos) => {
      const target = pos.targetHeadcount || 0;
      if (target <= 0) return;
      const count = employees.filter((e) => businessPositionId(e, pos.businessId) === pos.id && isActive(e)).length;
      const biz = businesses.find((b) => b.id === pos.businessId);
      if (count < target) under.push({ position: pos, biz, count, target, shortage: target - count });
      else if (count > target) over.push({ position: pos, biz, count, target, excess: count - target });
    });
    under.sort((a, b) => b.shortage - a.shortage);
    over.sort((a, b) => b.excess - a.excess);
    return { under, over };
  }, [positions, employees, businesses, isOwner, isBM, profile, activeBusinessId]);
  const understaffed = staffingIssues.under;
  const overstaffed = staffingIssues.over;

  const stats = [
    isOwner && { label: 'ธุรกิจ', value: businesses.length, icon: Building2, color: 'emerald' },
    { label: 'โซน', value: visibleZones.length, icon: MapPin, color: 'amber' },
    { label: 'ตำแหน่ง', value: isOwner && activeBusinessId ? positions.filter((p) => p.businessId === activeBusinessId).length : positions.length, icon: Award, color: 'rose' },
    { label: 'พนักงาน', value: visibleEmployees.length, icon: Users, color: 'sky' },
  ].filter(Boolean);

  const colorMap = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    sky: 'bg-sky-50 text-sky-700 border-sky-200',
  };

  const recentEmployees = [...visibleEmployees].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)).slice(0, 5);

  return (
    <div className="h-full overflow-auto">
      <PageHeader title={`สวัสดี, ${profile.name || 'ผู้ใช้'}`} subtitle="ภาพรวมข้อมูลในระบบ" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {stats.map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="bg-white rounded-xl border border-stone-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm text-stone-500">{s.label}</div>
                    <div className="text-3xl font-semibold text-stone-800 mt-1.5">{s.value}</div>
                  </div>
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center border ${colorMap[s.color]}`}><Icon className="w-5 h-5" /></div>
                </div>
              </div>
            );
          })}
        </div>
        {vacancies.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><AlertCircle className="w-4 h-4 text-amber-700" /></div>
              <h2 className="font-semibold text-amber-900">ตำแหน่งว่าง ({vacancies.length})</h2>
            </div>
            <p className="text-xs text-amber-700 mb-3">ตำแหน่งเหล่านี้มีคนลาออกและยังไม่มีคนทำงานแทน</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {vacancies.map((v, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-amber-200 rounded-lg">
                  <Award className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-stone-800 truncate">{v.position?.name || 'ไม่ระบุตำแหน่ง'}</div>
                    <div className="text-xs text-stone-500 truncate">{v.zone?.name}</div>
                    {v.lastResigned && <div className="text-[11px] text-amber-700 mt-0.5">{dispName(v.lastResigned)} ลาออก {v.lastResigned.resignedDate ? new Date(v.lastResigned.resignedDate).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {understaffed.length > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center"><Users className="w-4 h-4 text-rose-700" /></div>
              <h2 className="font-semibold text-rose-900">ตำแหน่งที่ต้องหาคนเพิ่ม ({understaffed.length})</h2>
            </div>
            <p className="text-xs text-rose-700 mb-3">ตำแหน่งเหล่านี้มีพนักงานไม่ครบตามอัตรากำลังที่กำหนด</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {understaffed.map((u, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-rose-200 rounded-lg">
                  <Award className="w-4 h-4 text-rose-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-800 truncate">{u.position?.name}</div>
                    {!activeBusinessId && u.biz && <div className="text-xs text-stone-500 truncate">{u.biz.name}</div>}
                    <div className="text-[11px] text-rose-700 mt-0.5 font-medium">มี {u.count}/{u.target} คน — ขาดอีก {u.shortage} คน</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {overstaffed.length > 0 && (
          <div className="bg-sky-50 border border-sky-200 rounded-xl p-5 mb-8">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center"><Users className="w-4 h-4 text-sky-700" /></div>
              <h2 className="font-semibold text-sky-900">ตำแหน่งที่มีคนเกิน ({overstaffed.length})</h2>
            </div>
            <p className="text-xs text-sky-700 mb-3">ตำแหน่งเหล่านี้มีพนักงานมากกว่าอัตรากำลังที่กำหนด</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {overstaffed.map((u, i) => (
                <div key={i} className="flex items-start gap-2 p-3 bg-white border border-sky-200 rounded-lg">
                  <Award className="w-4 h-4 text-sky-600 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-stone-800 truncate">{u.position?.name}</div>
                    {!activeBusinessId && u.biz && <div className="text-xs text-stone-500 truncate">{u.biz.name}</div>}
                    <div className="text-[11px] text-sky-700 mt-0.5 font-medium">มี {u.count}/{u.target} คน — เกิน {u.excess} คน</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {businesses.length === 0 && isOwner && (
          <div className="bg-gradient-to-br from-emerald-900 to-emerald-950 rounded-2xl p-8 text-white mb-8">
            <h2 className="text-xl font-semibold mb-2">เริ่มต้นใช้งาน</h2>
            <p className="text-emerald-100/80 text-sm mb-5">เริ่มจากสร้างธุรกิจ → เพิ่มโซน → ตำแหน่ง → พนักงาน</p>
            <button onClick={() => setView('businesses')} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-emerald-950 font-medium rounded-lg">เริ่มสร้างธุรกิจ</button>
          </div>
        )}
        {recentEmployees.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200">
            <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
              <h2 className="font-semibold text-stone-800">พนักงานล่าสุด</h2>
              <button onClick={() => setView('employees')} className="text-sm text-emerald-700 hover:text-emerald-800 flex items-center gap-1">ดูทั้งหมด <ChevronRight className="w-4 h-4" /></button>
            </div>
            <div className="divide-y divide-stone-100">
              {recentEmployees.map((emp) => {
                const zone = zones.find((z) => z.id === emp.zoneId);
                const pos = positions.find((p) => p.id === emp.positionId);
                return (
                  <div key={emp.id} className="px-6 py-4 flex items-center gap-4 hover:bg-stone-50">
                    <Avatar photo={emp.photo} name={dispName(emp)} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-800 truncate flex items-center gap-2">
                        <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                        <span className="truncate">{dispName(emp)}</span>
                      </div>
                      <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'} • {zone?.name || '—'}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============ AVATAR ============
function Avatar({ photo, name, size = 40 }) {
  const initials = (name || '?').split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  if (photo) return <img src={photo} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover border-2 border-white shadow-sm flex-shrink-0" />;
  return <div style={{ width: size, height: size, fontSize: size * 0.35 }} className="rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white font-medium flex items-center justify-center flex-shrink-0">{initials}</div>;
}

// ============ BUSINESSES + ZONES PAGE ============
function BusinessesPage({ businesses, zones, employees, positions, profile, ops, activeBusinessId, setActiveBusinessId, onOpenZone }) {
  const isOwner = profile?.isOwner;
  const [editingBiz, setEditingBiz] = useState(null);
  const [showBizModal, setShowBizModal] = useState(false);
  const [editingZone, setEditingZone] = useState(null);
  const [zoneModalBizId, setZoneModalBizId] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const toggle = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  const saveBiz = async (data) => {
    if (editingBiz?.id) await ops.business.update(editingBiz.id, data);
    else await ops.business.add(data);
    setShowBizModal(false); setEditingBiz(null);
  };
  const delBiz = async (id) => {
    if (!confirm('ลบธุรกิจนี้? โซน ตำแหน่ง และพนักงานทั้งหมดในธุรกิจนี้จะถูกลบด้วย')) return;
    await ops.business.delete(id);
    if (activeBusinessId === id) {
      const remaining = businesses.filter((b) => b.id !== id);
      setActiveBusinessId(remaining.length ? remaining[0].id : null);
    }
  };
  const saveZone = async (data) => {
    if (editingZone?.id) await ops.zone.update(editingZone.id, data);
    else await ops.zone.add({ ...data, businessId: zoneModalBizId });
    setEditingZone(null); setZoneModalBizId(null);
  };
  const delZone = async (id) => {
    if (employees.some((e) => e.zoneId === id)) return alert('มีพนักงานในโซนนี้ กรุณาย้ายพนักงานออกก่อน');
    if (!confirm('ลบโซนนี้?')) return;
    await ops.zone.delete(id);
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ธุรกิจและโซน" subtitle="จัดการธุรกิจและโซนภายในแต่ละธุรกิจ">
        {isOwner && (
          <button onClick={() => { setEditingBiz({}); setShowBizModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium">
            <Plus className="w-4 h-4" /> เพิ่มธุรกิจ
          </button>
        )}
      </PageHeader>
      <div className="p-8">
        {businesses.length === 0 ? (
          <EmptyState icon={Building2} title="ยังไม่มีธุรกิจ" description={isOwner ? 'เริ่มต้นด้วยการเพิ่มธุรกิจแรก' : 'ยังไม่มีธุรกิจที่คุณดูแล'} action={isOwner ? <button onClick={() => { setEditingBiz({}); setShowBizModal(true); }} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มธุรกิจ</button> : null} />
        ) : (
          <div className="space-y-4">
            {businesses.map((biz) => {
              const bizZones = zones.filter((z) => z.businessId === biz.id);
              const bizEmps = employees.filter((e) => e.businessId === biz.id || (e.additionalBusinessIds || []).includes(biz.id));
              const isCollapsed = collapsed[biz.id];
              return (
                <div key={biz.id} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                  <div className="p-5 flex items-center gap-4 group hover:bg-stone-50">
                    <button onClick={() => toggle(biz.id)} className="p-1 hover:bg-stone-200 rounded">
                      {isCollapsed ? <ChevronRight className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
                    </button>
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {biz.logo ? <img src={biz.logo} alt={biz.name} className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6 text-emerald-800" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-stone-800 text-lg">{biz.name}</h3>
                      {biz.description && <p className="text-sm text-stone-500 line-clamp-1">{biz.description}</p>}
                    </div>
                    <div className="flex items-center gap-6 text-sm flex-shrink-0">
                      <div className="text-center"><div className="text-stone-400 text-xs">โซน</div><div className="font-medium text-stone-700">{bizZones.length}</div></div>
                      <div className="text-center"><div className="text-stone-400 text-xs">พนักงาน</div><div className="font-medium text-stone-700">{bizEmps.length}</div></div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingBiz(biz); setShowBizModal(true); }} className="p-2 hover:bg-stone-200 rounded text-stone-600"><Edit2 className="w-4 h-4" /></button>
                      {isOwner && <button onClick={() => delBiz(biz.id)} className="p-2 hover:bg-red-100 rounded text-red-600"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="border-t border-stone-100 bg-stone-50/50 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2 text-sm font-medium text-stone-600"><MapPin className="w-4 h-4" /><span>โซนใน {biz.name}</span></div>
                        <button onClick={() => { setEditingZone({}); setZoneModalBizId(biz.id); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-50 border border-stone-200 hover:border-amber-300 rounded-lg text-sm text-stone-700 hover:text-amber-700 font-medium">
                          <Plus className="w-3.5 h-3.5" /> เพิ่มโซน
                        </button>
                      </div>
                      {(() => {
                        // คนที่อยู่ในธุรกิจนี้ (หลักหรือข้ามธุรกิจ) แต่ไม่มีโซนในธุรกิจนี้
                        // → รวมพนักงานข้ามธุรกิจที่ zone อยู่ในธุรกิจหลักของเขา ให้โผล่ในกลุ่ม "ไม่จำกัดโซน"
                        const crossZoneEmps = employees.filter((e) => {
                          const inThisBiz = e.businessId === biz.id || (e.additionalBusinessIds || []).includes(biz.id);
                          if (!inThisBiz) return false;
                          const zoneInThisBiz = e.zoneId && bizZones.some((z) => z.id === e.zoneId);
                          return !zoneInThisBiz;
                        });
                        const empty = bizZones.length === 0 && crossZoneEmps.length === 0;
                        if (empty) return <div className="text-center py-6 text-sm text-stone-400 italic">ยังไม่มีโซนในธุรกิจนี้</div>;
                        return (
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                            {bizZones.map((zone) => {
                              const zoneEmps = employees.filter((e) => e.zoneId === zone.id);
                              const count = zoneEmps.length;
                              return (
                                <div key={zone.id} onClick={() => onOpenZone(biz.id, zone.id)} className="bg-white rounded-lg border border-stone-200 p-4 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 transition-all group/zone cursor-pointer">
                                  <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0"><MapPinned className="w-4 h-4 text-amber-700" /></div>
                                      <div className="min-w-0"><div className="font-medium text-stone-800 truncate">{zone.name}</div><div className="text-xs text-stone-500">{count} คน</div></div>
                                    </div>
                                    <div className="flex gap-0.5 opacity-0 group-hover/zone:opacity-100 transition-opacity">
                                      <button onClick={(e) => { e.stopPropagation(); setEditingZone(zone); setZoneModalBizId(biz.id); }} className="p-1 hover:bg-stone-100 rounded text-stone-600"><Edit2 className="w-3.5 h-3.5" /></button>
                                      <button onClick={(e) => { e.stopPropagation(); delZone(zone.id); }} className="p-1 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                                    </div>
                                  </div>
                                  {zoneEmps.length > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {zoneEmps.slice(0, 8).map((e) => (
                                        <div key={e.id} className="flex flex-col items-center w-14" title={dispName(e)}>
                                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-emerald-100 border border-stone-200 flex items-center justify-center">
                                            {e.photo ? <img src={e.photo} alt={dispName(e)} className="w-full h-full object-cover" /> : <span className="text-base font-semibold text-emerald-800">{(dispName(e) || '?').trim().charAt(0)}</span>}
                                          </div>
                                          <span className="text-[10px] text-stone-600 mt-1 text-center leading-tight w-full truncate">{dispName(e)}</span>
                                        </div>
                                      ))}
                                      {zoneEmps.length > 8 && (
                                        <div className="w-12 h-12 rounded-lg bg-stone-100 border border-stone-200 flex items-center justify-center text-xs text-stone-500 self-start">+{zoneEmps.length - 8}</div>
                                      )}
                                    </div>
                                  )}
                                  {zone.description && <p className="text-xs text-stone-500 mt-2 line-clamp-2">{zone.description}</p>}
                                  <div className="mt-2 pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-amber-700 opacity-0 group-hover/zone:opacity-100 transition-opacity"><span>ดูพนักงาน</span><ChevronRight className="w-3.5 h-3.5" /></div>
                                </div>
                              );
                            })}
                            {crossZoneEmps.length > 0 && (
                              <div onClick={() => onOpenZone(biz.id, '__nozone__')} className="bg-amber-50/60 rounded-lg border-2 border-dashed border-amber-300 p-4 hover:bg-amber-50 hover:border-amber-400 hover:shadow-md hover:-translate-y-0.5 transition-all group/nz cursor-pointer">
                                <div className="flex items-center gap-2"><div className="w-8 h-8 rounded-lg bg-amber-200 flex items-center justify-center"><MapPin className="w-4 h-4 text-amber-800" /></div><div><div className="font-medium text-amber-900">ไม่จำกัดโซน</div><div className="text-xs text-amber-700">{crossZoneEmps.length} คน</div></div></div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {crossZoneEmps.slice(0, 8).map((e) => (
                                    <div key={e.id} className="flex flex-col items-center w-14" title={dispName(e)}>
                                      <div className="w-12 h-12 rounded-lg overflow-hidden bg-amber-100 border border-amber-200 flex items-center justify-center">
                                        {e.photo ? <img src={e.photo} alt={dispName(e)} className="w-full h-full object-cover" /> : <span className="text-base font-semibold text-amber-800">{(dispName(e) || '?').trim().charAt(0)}</span>}
                                      </div>
                                      <span className="text-[10px] text-amber-800 mt-1 text-center leading-tight w-full truncate">{dispName(e)}</span>
                                    </div>
                                  ))}
                                  {crossZoneEmps.length > 8 && (
                                    <div className="w-12 h-12 rounded-lg bg-amber-100 border border-amber-200 flex items-center justify-center text-xs text-amber-700 self-start">+{crossZoneEmps.length - 8}</div>
                                  )}
                                </div>
                                <p className="text-xs text-amber-700/80 mt-2">พนักงานที่ดูแลข้ามโซน เช่น ผู้จัดการ</p>
                                <div className="mt-2 pt-2 border-t border-amber-200 flex items-center justify-between text-xs text-amber-800 opacity-0 group-hover/nz:opacity-100 transition-opacity"><span>ดูพนักงาน</span><ChevronRight className="w-3.5 h-3.5" /></div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showBizModal && (
        <Modal title={editingBiz?.id ? 'แก้ไขธุรกิจ' : 'เพิ่มธุรกิจใหม่'} onClose={() => { setShowBizModal(false); setEditingBiz(null); }}>
          <BusinessForm initial={editingBiz} onSave={saveBiz} onCancel={() => { setShowBizModal(false); setEditingBiz(null); }} />
        </Modal>
      )}
      {zoneModalBizId && (
        <Modal title={editingZone?.id ? 'แก้ไขโซน' : `เพิ่มโซนใน ${businesses.find((b) => b.id === zoneModalBizId)?.name}`} onClose={() => { setEditingZone(null); setZoneModalBizId(null); }}>
          <ZoneForm initial={editingZone} onSave={saveZone} onCancel={() => { setEditingZone(null); setZoneModalBizId(null); }} />
        </Modal>
      )}
    </div>
  );
}

function BusinessForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [logo, setLogo] = useState(initial?.logo || '');
  const [companyName, setCompanyName] = useState(initial?.companyName || '');
  const [companyAddress, setCompanyAddress] = useState(initial?.companyAddress || '');
  const [taxId, setTaxId] = useState(initial?.taxId || '');
  const [slipUseCompanyHeader, setSlipUseCompanyHeader] = useState(initial?.slipUseCompanyHeader ?? false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const handleLogo = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setLogo(await resizeImage(f, 400)); } finally { setUploading(false); }
  };
  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อธุรกิจ');
    onSave({
      name: name.trim(), description: description.trim(), logo: logo || null,
      companyName: companyName.trim() || null, companyAddress: companyAddress.trim() || null,
      taxId: taxId.trim() || null, slipUseCompanyHeader,
    });
  };
  return (
    <div className="space-y-4">
      <FormField label="โลโก้ธุรกิจ">
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 flex items-center justify-center overflow-hidden flex-shrink-0">
            {logo ? <img src={logo} alt="logo" className="w-full h-full object-contain" /> : <Building2 className="w-7 h-7 text-stone-300" />}
          </div>
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handleLogo} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              <Upload className="w-4 h-4" />{uploading ? 'กำลังอัปโหลด...' : (logo ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้')}
            </button>
            {logo && <button type="button" onClick={() => setLogo('')} className="text-xs text-red-600 hover:underline text-left">ลบโลโก้</button>}
          </div>
        </div>
      </FormField>
      <FormField label="ชื่อธุรกิจ / ชื่อตลาด" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น ตลาดมารวยปิ่นเกล้า" /></FormField>
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-600" />
            <h3 className="text-sm font-medium text-stone-800">ข้อมูลบริษัท (สำหรับหัวสลิป/รายงานเงินเดือน)</h3>
          </div>
          <button type="button" onClick={() => setSlipUseCompanyHeader((v) => !v)} className={`relative w-12 h-7 rounded-full transition-colors flex-shrink-0 ${slipUseCompanyHeader ? 'bg-emerald-600' : 'bg-stone-300'}`} aria-label="ใช้ข้อมูลบริษัทบนหัวสลิป">
            <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${slipUseCompanyHeader ? 'translate-x-5' : ''}`} />
          </button>
        </div>
        <p className="text-xs text-stone-500 -mt-1">{slipUseCompanyHeader ? 'หัวสลิป/รายงานจะขึ้น ชื่อบริษัท + ที่อยู่ + เลขผู้เสียภาษี' : `หัวสลิป/รายงานจะขึ้นเฉพาะชื่อ "${name.trim() || 'ชื่อตลาด'}" เท่านั้น`}</p>
        {slipUseCompanyHeader && (
          <div className="space-y-3 pt-1">
            <FormField label="ชื่อบริษัท (ตามทะเบียน)"><input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น บริษัท มารวย จำกัด" /></FormField>
            <FormField label="ที่อยู่บริษัท"><textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="เลขที่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์" /></FormField>
            <FormField label="เลขประจำตัวผู้เสียภาษี"><input value={taxId} onChange={(e) => setTaxId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 font-mono" placeholder="0-0000-00000-00-0" /></FormField>
          </div>
        )}
      </div>

      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

function ZoneForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const submit = () => { if (!name.trim()) return alert('กรุณากรอกชื่อโซน'); onSave({ name: name.trim(), description: description.trim() }); };
  return (
    <div className="space-y-4">
      <FormField label="ชื่อโซน" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น สาขาสีลม" /></FormField>
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ POSITIONS PAGE ============
function PositionsPage({ businesses, positions, employees, profile, activeBusinessId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const isOwner = profile.isOwner;
  const canManageBiz = isOwner || profile.isBM;
  const canManagePayroll = profile.canManagePayroll;
  const bizPositions = positions.filter((p) => p.businessId === activeBusinessId);

  const save = async (d) => {
    if (editing?.id) await ops.position.update(editing.id, d);
    else await ops.position.add({ ...d, businessId: activeBusinessId });
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (employees.some((e) => e.positionId === id)) return alert('มีพนักงานในตำแหน่งนี้');
    if (positions.some((p) => p.parentId === id)) return alert('มีตำแหน่งอื่นรายงานต่อตำแหน่งนี้');
    if (!confirm('ลบตำแหน่งนี้?')) return;
    await ops.position.delete(id);
  };

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="ตำแหน่ง" /><div className="p-8"><EmptyState icon={Award} title="เลือกธุรกิจที่ sidebar" description="ตำแหน่งเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>
  );
  const roots = bizPositions.filter((p) => !p.parentId);
  const shortages = bizPositions
    .map((p) => { const count = employees.filter((e) => businessPositionId(e, activeBusinessId) === p.id && isActive(e)).length; const target = p.targetHeadcount || 0; return { p, count, target, short: target > 0 ? Math.max(0, target - count) : 0 }; })
    .filter((x) => x.short > 0)
    .sort((a, b) => b.short - a.short);
  const totalShort = shortages.reduce((s, x) => s + x.short, 0);

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ตำแหน่ง" subtitle={`ธุรกิจ: ${businesses.find((b) => b.id === activeBusinessId)?.name}`}>
        {canManageBiz && <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มตำแหน่ง</button>}
      </PageHeader>
      <div className="p-8">
        {bizPositions.length === 0 ? (
          <EmptyState icon={Award} title="ยังไม่มีตำแหน่ง" description="เพิ่มตำแหน่งและกำหนดสายบังคับบัญชา (เช่น ผู้จัดการ → หัวหน้าโซน → พนักงาน)" />
        ) : (
          <>
            {shortages.length > 0 && (
              <div className="mb-4 bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-200 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-800" /></div>
                  <div>
                    <h3 className="font-semibold text-amber-900">ตำแหน่งที่พนักงานขาด</h3>
                    <div className="text-xs text-amber-700">ขาดรวม <b>{totalShort} อัตรา</b> ใน {shortages.length} ตำแหน่ง</div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {shortages.map(({ p, count, target, short }) => (
                    <span key={p.id} className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-sm">
                      <span className="font-medium text-stone-800">{p.name}</span>
                      <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded text-xs font-bold">ขาด {short}</span>
                      <span className="text-xs text-stone-400">{count}/{target}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="bg-white rounded-xl border border-stone-200 p-6">
              <PositionTree positions={roots} allPositions={bizPositions} employees={employees} activeBusinessId={activeBusinessId} onEdit={(p) => { setEditing(p); setShowModal(true); }} onDelete={del} isOwner={canManageBiz} canManagePayroll={canManagePayroll} level={0} />
            </div>
          </>
        )}
      </div>
      {showModal && (
        <Modal title={editing?.id ? 'แก้ไขตำแหน่ง' : 'เพิ่มตำแหน่งใหม่'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <PositionForm initial={editing} positions={bizPositions} canManagePayroll={canManagePayroll} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}

function PositionTree({ positions, allPositions, employees, activeBusinessId, onEdit, onDelete, isOwner, canManagePayroll, level }) {
  return (
    <div className={level === 0 ? 'space-y-2' : 'mt-2 ml-6 pl-4 border-l-2 border-stone-200 space-y-2'}>
      {positions.map((pos) => {
        const children = allPositions.filter((p) => p.parentId === pos.id);
        const count = employees.filter((e) => businessPositionId(e, activeBusinessId) === pos.id && isActive(e)).length;
        const target = pos.targetHeadcount || 0;
        const shortage = target > 0 ? Math.max(0, target - count) : 0;
        const over = target > 0 ? Math.max(0, count - target) : 0;
        const full = target > 0 && count === target;
        return (
          <div key={pos.id}>
            <div className={`flex items-center justify-between p-3 rounded-lg group ${shortage > 0 ? 'bg-amber-50 hover:bg-amber-100 border-l-4 border-amber-400' : 'bg-stone-50 hover:bg-stone-100'}`}>
              <div className="flex items-center gap-3">
                <Award className={`w-4 h-4 ${shortage > 0 ? 'text-amber-700' : 'text-emerald-700'}`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap"><div className="font-medium text-stone-800">{pos.name}</div>
                    {pos.crossZone && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-medium rounded-full"><MapPin className="w-2.5 h-2.5" />ไม่จำกัดโซน</span>}
                    {target > 0 && (
                      full
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-medium rounded-full"><CheckCircle2 className="w-2.5 h-2.5" />ครบ {count}/{target}</span>
                        : over > 0
                          ? <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-100 text-sky-800 text-[10px] font-medium rounded-full"><AlertCircle className="w-2.5 h-2.5" />เกิน {over} ({count}/{target})</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full"><AlertCircle className="w-3 h-3" />ขาด {shortage} คน ({count}/{target})</span>
                    )}
                  </div>
                  <div className="text-xs text-stone-500">{count} คน{target > 0 ? ` (ต้องการ ${target})` : ''}{pos.description ? ` • ${pos.description}` : ''}</div>
                  {canManagePayroll && pos.standardSalary && (
                    <div className="mt-1.5 inline-flex items-start gap-1.5 px-2.5 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700 mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Standard Salary</div>
                        <div className="text-xs text-stone-700 whitespace-pre-line">{pos.standardSalary}</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {isOwner && (
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => onEdit(pos)} className="p-1.5 hover:bg-white rounded text-stone-600"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onDelete(pos.id)} className="p-1.5 hover:bg-red-50 rounded text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              )}
            </div>
            {children.length > 0 && <PositionTree positions={children} allPositions={allPositions} employees={employees} activeBusinessId={activeBusinessId} onEdit={onEdit} onDelete={onDelete} isOwner={isOwner} canManagePayroll={canManagePayroll} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

function PositionForm({ initial, positions, canManagePayroll, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [parentId, setParentId] = useState(initial?.parentId || '');
  const [crossZone, setCrossZone] = useState(initial?.crossZone || false);
  const [targetHeadcount, setTargetHeadcount] = useState(initial?.targetHeadcount ?? 0);
  const [standardSalary, setStandardSalary] = useState(initial?.standardSalary || '');
  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อตำแหน่ง');
    onSave({
      name: name.trim(), description: description.trim(), parentId: parentId || null, crossZone, targetHeadcount: Number(targetHeadcount) || 0,
      ...(canManagePayroll ? { standardSalary: standardSalary.trim() || null } : {}),
    });
  };
  const isDescendant = (id, of) => { let p = positions.find((x) => x.id === id); while (p) { if (p.id === of) return true; p = positions.find((x) => x.id === p.parentId); } return false; };
  const validParents = positions.filter((p) => p.id !== initial?.id && !isDescendant(p.id, initial?.id));

  return (
    <div className="space-y-4">
      <FormField label="ชื่อตำแหน่ง" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น ผู้จัดการ" /></FormField>
      <FormField label="รายงานต่อตำแหน่ง">
        <select value={parentId} onChange={(e) => setParentId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
          <option value="">— ตำแหน่งสูงสุด (ไม่มีหัวหน้า) —</option>
          {validParents.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FormField>
      <FormField label="จำนวนที่ต้องการ (อัตรากำลัง)">
        <input type="number" min="0" value={targetHeadcount} onChange={(e) => setTargetHeadcount(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0 = ไม่กำหนด" />
        <p className="text-xs text-stone-500 mt-1">ระบุจำนวนพนักงานที่ตำแหน่งนี้ควรมี — ถ้ายังไม่ครบ ระบบจะเตือนให้หาคนเพิ่ม (ใส่ 0 = ไม่เตือน)</p>
      </FormField>
      {canManagePayroll && (
        <FormField label="Standard Salary">
          <textarea value={standardSalary} onChange={(e) => setStandardSalary(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="เช่น เริ่มต้น 12,000 / ผ่านโปร 13,500 / มีประสบการณ์ 15,000+" />
          <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><Wallet className="w-3 h-3" />เห็นเฉพาะผู้ที่มีสิทธิ์ดูเงินเดือนเท่านั้น</p>
        </FormField>
      )}
      <FormField label="รายละเอียด"><textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <label className="flex items-start gap-3 p-3 bg-stone-50 rounded-lg cursor-pointer hover:bg-stone-100 border border-stone-200">
        <input type="checkbox" checked={crossZone} onChange={(e) => setCrossZone(e.target.checked)} className="mt-0.5 w-4 h-4 rounded text-emerald-700" />
        <div><div className="text-sm font-medium text-stone-800">ตำแหน่งนี้ไม่จำกัดโซน</div><div className="text-xs text-stone-500 mt-0.5">เหมาะกับตำแหน่งที่ดูแลข้ามโซน เช่น ผู้จัดการ</div></div>
      </label>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ EMPLOYEES PAGE ============
function EmployeesPage({ businesses, zones, positions, employees, profile, activeBusinessId, activeZoneId, setActiveZoneId, ops }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('active'); // active | resigned | all
  const [resigningEmp, setResigningEmp] = useState(null);
  const [raisingEmp, setRaisingEmp] = useState(null);
  const [salaryReload, setSalaryReload] = useState(0);
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const canWrite = profile.canWrite;
  const canResign = isOwner || isBM; // owner + หัวหน้าธุรกิจ

  const visibleEmployees = useMemo(() => {
    let list;
    if (isOwner) {
      list = activeBusinessId
        ? employees.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))
        : employees;
    } else if (isBM) {
      const ids = profile.businessIds || [];
      list = employees.filter((e) => ids.includes(e.businessId) || (e.additionalBusinessIds || []).some((id) => ids.includes(id)));
      if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId));
    } else if (isZM) {
      const zoneIds = profile.zoneIds || [];
      list = employees.filter((e) => zoneIds.includes(e.zoneId));
    } else if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) {
        list = activeBusinessId ? employees.filter((e) => e.businessId === activeBusinessId) : employees;
      } else {
        list = employees.filter((e) => profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId));
        if (activeBusinessId) list = list.filter((e) => e.businessId === activeBusinessId);
      }
    } else {
      list = [];
    }
    // กรองตามสถานะ ทำงานอยู่/ลาออกแล้ว
    if (statusFilter === 'active') list = list.filter((e) => isActive(e));
    else if (statusFilter === 'resigned') list = list.filter((e) => !isActive(e));
    if (activeZoneId === '__nozone__') list = list.filter((e) => !e.zoneId);
    else if (activeZoneId) list = list.filter((e) => e.zoneId === activeZoneId);
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((e) => e.name?.toLowerCase().includes(s) || e.nickname?.toLowerCase().includes(s) || e.employeeNumber?.toLowerCase().includes(s) || e.phone?.includes(s) || e.email?.toLowerCase().includes(s));
    }
    return list;
  }, [employees, profile, activeBusinessId, activeZoneId, search, statusFilter, isOwner, isBM, isZM, isViewer]);

  // โซนที่ user เลือกได้
  const visibleZones = useMemo(() => {
    if (isOwner) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
    if (isBM) return zones.filter((z) => (profile.businessIds || []).includes(z.businessId) && (!activeBusinessId || z.businessId === activeBusinessId));
    if (isZM) return zones.filter((z) => (profile.zoneIds || []).includes(z.id));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return activeBusinessId ? zones.filter((z) => z.businessId === activeBusinessId) : zones;
      return zones.filter((z) => profile.businessIds.includes(z.businessId) || profile.zoneIds.includes(z.id));
    }
    return [];
  }, [zones, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);

  const filteredZoneName = activeZoneId === '__nozone__' ? 'ไม่จำกัดโซน' : (activeZoneId ? zones.find((z) => z.id === activeZoneId)?.name : null);

  // ธุรกิจปัจจุบันสำหรับการเพิ่มพนักงาน (ใช้ activeBusinessId; ถ้าไม่มีให้ default ตาม role)
  const targetBusinessId = activeBusinessId
    || (isBM && profile.businessIds[0])
    || (isZM && zones.find((z) => (profile.zoneIds || []).includes(z.id))?.businessId)
    || null;

  const save = async (d) => {
    const payload = { ...d, businessId: targetBusinessId };
    // เลขพนักงานไม่ซ้ำทั้งระบบ (global unique)
    const parseNum = (v) => { const n = parseInt(String(v ?? '').trim(), 10); return Number.isFinite(n) ? n : 0; };
    if (!payload.employeeNumber) {
      // เว้นว่าง → สร้างเลขถัดไปแบบไม่ซ้ำทั้งระบบ เติม 0 เป็น 3 หลัก
      const maxNum = employees.reduce((m, e) => Math.max(m, parseNum(e.employeeNumber)), 0);
      payload.employeeNumber = String(maxNum + 1).padStart(3, '0');
    } else {
      // กรอกเอง → เลขล้วนปรับเป็น 3 หลัก แล้วกันซ้ำกับคนอื่นทั้งระบบ
      let num = String(payload.employeeNumber).trim();
      if (/^\d+$/.test(num)) num = num.padStart(3, '0');
      payload.employeeNumber = num;
      const dup = employees.find((e) => e.id !== editing?.id && String(e.employeeNumber || '').trim() === num);
      if (dup) { alert(`เลขพนักงาน #${num} ซ้ำกับ ${dispName(dup)} แล้ว กรุณาใช้เลขอื่น (เว้นว่างไว้เพื่อให้ระบบรันเลขให้อัตโนมัติ)`); return; }
    }
    if (editing?.id) await ops.employee.update(editing.id, payload);
    else await ops.employee.add(payload);
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (!confirm('ลบพนักงานคนนี้?')) return;
    const emp = employees.find((e) => e.id === id);
    const toDelete = [...(emp?.workPermitDocs || []), ...(emp?.passportDocs || []), ...(emp?.applicationDocs || [])];
    for (const path of toDelete) await deleteDocument(path);
    await ops.employee.delete(id);
  };
  const doResign = async (d) => {
    await ops.employee.resign(resigningEmp.id, d);
    setResigningEmp(null); setViewing(null);
  };
  const doRehire = async (emp) => {
    if (!confirm(`จ้าง ${dispName(emp)} กลับเข้าทำงาน?`)) return;
    await ops.employee.rehire(emp.id);
    setViewing(null);
  };

  const allMode = (isOwner || isBM) && !activeBusinessId && (isOwner || (profile.businessIds || []).length > 1);

  if (isOwner && businesses.length === 0) return (
    <div className="h-full overflow-auto"><PageHeader title="พนักงาน" /><div className="p-8"><EmptyState icon={Users} title="ยังไม่มีธุรกิจ" description="สร้างธุรกิจก่อนที่หน้า 'ธุรกิจและโซน'" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title={filteredZoneName ? `พนักงาน — ${filteredZoneName}` : (allMode ? 'พนักงานทุกคน — ภาพรวมทุกธุรกิจ' : 'พนักงาน')} subtitle={`${visibleEmployees.length} คน${filteredZoneName ? ' ในโซนนี้' : (allMode ? ' รวมทุกธุรกิจ' : '')}`}>
        {canWrite && !allMode && targetBusinessId && (
          <button onClick={() => { setEditing({}); setShowModal(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" /> เพิ่มพนักงาน</button>
        )}
      </PageHeader>
      <div className="p-8">
        {allMode && (
          <div className="mb-4 flex items-start gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-lg text-sm text-sky-900">
            <Building2 className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>กำลังดูพนักงานจาก<strong> ทุกธุรกิจ ({businesses.length} ที่)</strong> รวมกัน — เลือกธุรกิจที่ sidebar เพื่อกรองเฉพาะธุรกิจเดียว หรือเพิ่มพนักงานใหม่</div>
          </div>
        )}
        {isOwner && activeZoneId && (
          <div className="mb-4 inline-flex items-center gap-2 px-3 py-1.5 bg-amber-100 border border-amber-200 rounded-full text-sm text-amber-800">
            <MapPin className="w-3.5 h-3.5" /><span>กรองตามโซน: <strong>{filteredZoneName}</strong></span>
            <button onClick={() => setActiveZoneId(null)} className="ml-1 p-0.5 hover:bg-amber-200 rounded-full"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ, เลขพนักงาน, เบอร์โทร, อีเมล..." className="w-full pl-10 pr-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
          </div>
          <div className="inline-flex rounded-lg border border-stone-300 overflow-hidden">
            {[['active', 'ทำงานอยู่'], ['resigned', 'ลาออกแล้ว'], ['all', 'ทั้งหมด']].map(([v, label]) => (
              <button key={v} onClick={() => setStatusFilter(v)} className={`px-3 py-2 text-sm font-medium ${statusFilter === v ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>{label}</button>
            ))}
          </div>
          {isOwner && activeBusinessId && (
            <select value={activeZoneId || 'all'} onChange={(e) => setActiveZoneId(e.target.value === 'all' ? null : e.target.value)} className="px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
              <option value="all">ทุกโซน</option>
              {visibleZones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              <option value="__nozone__">— ไม่จำกัดโซน —</option>
            </select>
          )}
        </div>
        {visibleEmployees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีพนักงาน" description="กดปุ่ม 'เพิ่มพนักงาน' เพื่อเริ่มต้น" />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visibleEmployees.map((emp) => {
              const zone = zones.find((z) => z.id === emp.zoneId);
              const pos = positions.find((p) => p.id === (activeBusinessId ? businessPositionId(emp, activeBusinessId) : emp.positionId));
              const empBiz = businesses.find((b) => b.id === emp.businessId);
              const display = dispName(emp);
              const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
              const hasNick = emp.nickname?.trim() && emp.nickname.trim() !== emp.name?.trim();
              const extraBizCount = (emp.additionalBusinessIds || []).length;
              const resigned = !isActive(emp);
              return (
                <div key={emp.id} onClick={() => setViewing(emp)} className={`bg-white rounded-xl border ${resigned ? 'border-stone-200 opacity-70' : 'border-stone-200'} hover:shadow-lg hover:-translate-y-0.5 hover:border-emerald-300 transition-all group overflow-hidden cursor-pointer`}>
                  <div className="relative aspect-square bg-gradient-to-br from-stone-100 to-stone-200 overflow-hidden">
                    {emp.photo ? <img src={emp.photo} alt={display} className={`w-full h-full object-contain ${resigned ? 'grayscale' : ''}`} /> : (
                      <div className="w-full h-full flex items-center justify-center"><div className={`w-24 h-24 rounded-full text-white text-3xl font-semibold flex items-center justify-center ${resigned ? 'bg-stone-400' : 'bg-gradient-to-br from-emerald-700 to-emerald-900'}`}>{initials}</div></div>
                    )}
                    {resigned && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-stone-700/90 backdrop-blur text-white text-xs font-medium rounded-md shadow-sm">ลาออกแล้ว</span>
                      </div>
                    )}
                    {canWrite && !resigned && (
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditing(emp); setShowModal(true); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-stone-700 shadow-sm"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); del(emp.id); }} className="p-2 bg-white/95 hover:bg-white rounded-lg text-red-600 shadow-sm"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    )}
                    {(zone || pos?.crossZone) && (
                      <div className="absolute bottom-2 left-2">
                        {zone ? <span className="inline-flex items-center gap-1 px-2 py-1 bg-white/95 backdrop-blur text-stone-700 text-xs font-medium rounded-md shadow-sm"><MapPin className="w-3 h-3" />{zone.name}</span>
                          : <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100/95 backdrop-blur text-amber-800 text-xs font-medium rounded-md shadow-sm"><MapPin className="w-3 h-3" />ไม่จำกัดโซน</span>}
                      </div>
                    )}
                    {isForeign(emp.nationality) && (
                      <div className="absolute top-2 left-2">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-900/90 text-white text-[10px] font-medium rounded-md backdrop-blur"><span className="text-xs leading-none">{natFlag(emp.nationality)}</span>{natLabel(emp.nationality)}</span>
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <div className="text-xs font-mono text-stone-400 mb-0.5">#{emp.employeeNumber || '—'}</div>
                    <h3 className="font-semibold text-stone-800 truncate">{display}</h3>
                    {hasNick && <div className="text-xs text-stone-400 truncate">{emp.name}</div>}
                    <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'}</div>
                    {allMode && empBiz && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-medium rounded">
                        <Building2 className="w-2.5 h-2.5" />{empBiz.name}
                      </div>
                    )}
                    {extraBizCount > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-700 text-[10px] font-medium rounded">
                        <Building2 className="w-2.5 h-2.5" />ดูแลอีก {extraBizCount} ธุรกิจ
                      </div>
                    )}
                    {emp.phone && <div className="mt-2 text-xs text-stone-500 flex items-center gap-1.5"><Phone className="w-3 h-3" /><span className="truncate">{emp.phone}</span></div>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showModal && (
        <Modal title={editing?.id ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'} onClose={() => { setShowModal(false); setEditing(null); }} wide>
          <EmployeeForm initial={editing} zones={visibleZones} positions={positions.filter((p) => p.businessId === targetBusinessId)} allPositions={positions} employees={employees.filter((e) => e.businessId === targetBusinessId && e.id !== editing?.id)} businesses={businesses} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} lockedZoneId={isZM && (profile.zoneIds || []).length === 1 ? profile.zoneIds[0] : null} allowedZoneIds={isZM ? (profile.zoneIds || []) : null} businessId={targetBusinessId} isOwner={isOwner || isBM} canEditPay={profile.canManagePayroll} />
        </Modal>
      )}
      {viewing && (() => {
        const v = employees.find((e) => e.id === viewing.id) || viewing;
        return (
        <EmployeeDetailModal employee={v} salaryReload={salaryReload} zones={zones} positions={positions} employees={employees} businesses={businesses} canWrite={canWrite} canResign={canResign} canRaise={profile.canManagePayroll} ops={ops} onClose={() => setViewing(null)} onEdit={() => { setEditing(v); setShowModal(true); setViewing(null); }} onDelete={() => { del(v.id); setViewing(null); }} onResign={() => setResigningEmp(v)} onRehire={() => doRehire(v)} onRaise={() => setRaisingEmp(v)} />
        );
      })()}
      {resigningEmp && (
        <ResignModal employee={resigningEmp} onClose={() => setResigningEmp(null)} onConfirm={doResign} />
      )}
      {raisingEmp && (
        <SalaryRaiseModal employee={raisingEmp} ops={ops} onClose={() => setRaisingEmp(null)} onSaved={() => { setRaisingEmp(null); setSalaryReload((n) => n + 1); }} />
      )}
    </div>
  );
}

// ============ MODAL: บันทึกการลาออก ============
function ResignModal({ employee, onClose, onConfirm }) {
  const [resignedDate, setResignedDate] = useState(new Date().toISOString().slice(0, 10));
  const [resignReason, setResignReason] = useState('voluntary');
  const [resignNote, setResignNote] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!resignedDate) return alert('กรุณาระบุวันที่ลาออก');
    setSaving(true);
    try { await onConfirm({ resignedDate, resignReason, resignNote: resignNote.trim() || null }); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">บันทึกการลาออก</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-medium text-stone-800"><span className="font-mono text-xs text-stone-400 mr-1">#{employee.employeeNumber}</span>{dispName(employee)}</div>
              <div className="text-xs text-stone-500">กำลังบันทึกว่าพนักงานคนนี้ลาออก</div>
            </div>
          </div>
          <FormField label="วันที่ลาออก" required>
            <input type="date" value={resignedDate} onChange={(e) => setResignedDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" />
          </FormField>
          <FormField label="เหตุผล" required>
            <div className="grid grid-cols-2 gap-2">
              {RESIGN_REASONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setResignReason(r.value)} className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${resignReason === r.value ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-900' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}>{r.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label="หมายเหตุ">
            <textarea value={resignNote} onChange={(e) => setResignNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
          </FormField>
          <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>ข้อมูลพนักงานและประวัติเงินเดือนจะยังถูกเก็บไว้ — สามารถจ้างกลับได้ภายหลัง</div>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-stone-700 hover:bg-stone-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"><LogOut className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'ยืนยันการลาออก'}</button>
        </div>
      </div>
    </div>
  );
}

// ============ MODAL: ปรับเงินเดือน ============
function SalaryRaiseModal({ employee, ops, onClose, onSaved }) {
  const current = Number(employee.baseSalary) || 0;
  const [newSalary, setNewSalary] = useState('');
  // สร้างรายการเดือน: เดือนปัจจุบัน + อีก 12 เดือนข้างหน้า
  const monthOptions = useMemo(() => {
    const opts = [];
    const now = new Date();
    for (let i = 0; i < 13; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const y = d.getFullYear(), m = d.getMonth() + 1;
      opts.push({
        value: `${y}-${String(m).padStart(2, '0')}`,   // เช่น 2026-05
        date: `${y}-${String(m).padStart(2, '0')}-01`,   // วันที่ 1 ของเดือน
        label: `${MONTH_NAMES[m - 1]} ${y + 543}`,
        isCurrent: i === 0,
      });
    }
    return opts;
  }, []);
  const [effectiveMonth, setEffectiveMonth] = useState(monthOptions[0].value);
  const [reason, setReason] = useState('annual');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const newVal = Number(newSalary) || 0;
  const diff = newVal - current;
  const pct = current > 0 ? (diff / current) * 100 : 0;
  const selectedOpt = monthOptions.find((o) => o.value === effectiveMonth) || monthOptions[0];
  const isFuture = !selectedOpt.isCurrent;

  const submit = async () => {
    if (!newVal || newVal <= 0) return alert('กรุณากรอกเงินเดือนใหม่');
    if (newVal === current) return alert('เงินเดือนใหม่เท่ากับเดิม');
    setSaving(true);
    try {
      const effectiveDate = selectedOpt.date;     // วันที่ 1 ของเดือนที่เลือก
      const applyNow = !isFuture;                  // เดือนปัจจุบัน = มีผลทันที
      await ops.salaryChange.add({
        employeeId: employee.id, businessId: employee.businessId,
        effectiveDate, oldSalary: current, newSalary: newVal,
        reason, note: note.trim() || null,
        status: applyNow ? 'applied' : 'pending',
        appliedAt: applyNow ? new Date().toISOString() : null,
      });
      if (applyNow) await ops.employee.update(employee.id, { baseSalary: newVal });
      onSaved();
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">ปรับเงินเดือน</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-auto space-y-4">
          <div className="flex items-center gap-3 p-3 bg-stone-50 rounded-lg">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-medium text-stone-800"><span className="font-mono text-xs text-stone-400 mr-1">#{employee.employeeNumber}</span>{dispName(employee)}</div>
              <div className="text-xs text-stone-500">เงินเดือนปัจจุบัน {fmtMoney(current)} ฿</div>
            </div>
          </div>
          <FormField label="เงินเดือนใหม่ (บาท)" required>
            <input type="number" min="0" step="0.01" autoFocus value={newSalary} onChange={(e) => setNewSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder={`เดิม ${fmtMoney(current)}`} />
            {newVal > 0 && diff !== 0 && (
              <p className={`text-xs mt-1 font-medium ${diff > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {diff > 0 ? '▲ เพิ่มขึ้น' : '▼ ลดลง'} {fmtMoney(Math.abs(diff))} ฿ ({pct > 0 ? '+' : ''}{pct.toFixed(1)}%)
              </p>
            )}
          </FormField>
          <FormField label="เดือนที่มีผล" required>
            <select value={effectiveMonth} onChange={(e) => setEffectiveMonth(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
              {monthOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}{o.isCurrent ? ' (เดือนนี้)' : ''}</option>
              ))}
            </select>
            {isFuture
              ? <p className="text-xs text-amber-700 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />ตั้งล่วงหน้า — เงินเดือนจะปรับอัตโนมัติเมื่อถึงต้นเดือน {selectedOpt.label}</p>
              : <p className="text-xs text-emerald-700 mt-1 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />ปรับทันทีสำหรับเดือนนี้</p>}
          </FormField>
          <FormField label="เหตุผล" required>
            <div className="grid grid-cols-2 gap-2">
              {SALARY_REASONS.map((r) => (
                <button key={r.value} type="button" onClick={() => setReason(r.value)} className={`px-3 py-2 rounded-lg border-2 text-sm transition-all ${reason === r.value ? 'border-emerald-600 bg-emerald-50 font-medium text-emerald-900' : 'border-stone-200 text-stone-700 hover:border-stone-300'}`}>{r.label}</button>
              ))}
            </div>
          </FormField>
          <FormField label="หมายเหตุ">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)" />
          </FormField>
        </div>
        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium disabled:opacity-50"><TrendingUp className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : (isFuture ? 'ตั้งเวลาปรับ' : 'บันทึก + ปรับทันที')}</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeDetailModal({ employee, salaryReload, zones, positions, employees, businesses, canWrite, canResign, canRaise, ops, onClose, onEdit, onDelete, onResign, onRehire, onRaise }) {
  const zone = zones.find((z) => z.id === employee.zoneId);
  const pos = positions.find((p) => p.id === employee.positionId);
  const mgr = employees.find((e) => e.id === employee.managerId);
  const reports = employees.filter((e) => e.managerId === employee.id);
  const primaryBiz = businesses?.find((b) => b.id === employee.businessId);
  const additionalBizs = (employee.additionalBusinessIds || []).map((id) => businesses?.find((b) => b.id === id)).filter(Boolean);
  const resigned = !isActive(employee);
  const [salaryHistory, setSalaryHistory] = useState(null);
  useEffect(() => {
    if (!canRaise || !ops) return;
    let cancelled = false;
    (async () => {
      const h = await ops.salaryChange.listByEmployee(employee.id);
      if (!cancelled) setSalaryHistory(h);
    })();
    return () => { cancelled = true; };
  }, [employee.id, canRaise, salaryReload]);
  const fmt = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : null);
  const yos = employee.startDate ? Math.floor((Date.now() - new Date(employee.startDate)) / (365.25 * 24 * 60 * 60 * 1000)) : null;
  const display = dispName(employee);
  const hasNick = employee.nickname?.trim() && employee.nickname.trim() !== employee.name?.trim();
  const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const foreign = isForeign(employee.nationality);
  const [showCard, setShowCard] = useState(false);

  // คำนวณว่าบัตรแรงงานหมดอายุหรือใกล้หมดอายุไหม
  let permitStatus = null;
  if (employee.workPermitExpiry) {
    const days = Math.ceil((new Date(employee.workPermitExpiry) - Date.now()) / (24 * 60 * 60 * 1000));
    if (days < 0) permitStatus = { label: 'หมดอายุแล้ว', cls: 'text-red-700 bg-red-100' };
    else if (days < 30) permitStatus = { label: `เหลือ ${days} วัน`, cls: 'text-amber-800 bg-amber-100' };
    else permitStatus = { label: `เหลือ ${days} วัน`, cls: 'text-emerald-700 bg-emerald-50' };
  }
  // ข้อความสถานะวันหมดอายุ (ใช้กับบัตรประจำตัว/พาสปอร์ต)
  const expLabel = (d) => {
    if (!d) return '';
    const days = Math.ceil((new Date(d) - Date.now()) / 86400000);
    return days < 0 ? 'หมดอายุแล้ว' : `เหลือ ${days} วัน`;
  };

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">รายละเอียดพนักงาน</h2>
          <div className="flex items-center gap-2">
            {canResign && <button onClick={() => setShowCard(true)} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-medium"><CreditCard className="w-4 h-4" /> บัตรพนักงาน</button>}
            <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-500"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="overflow-auto">
          <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 p-6">
            <div className="aspect-square bg-gradient-to-br from-stone-100 to-stone-200 rounded-2xl overflow-hidden">
              {employee.photo ? <img src={employee.photo} alt={display} className="w-full h-full object-contain" /> : (
                <div className="w-full h-full flex items-center justify-center"><div className="w-32 h-32 rounded-full bg-gradient-to-br from-emerald-700 to-emerald-900 text-white text-5xl font-semibold flex items-center justify-center">{initials}</div></div>
              )}
            </div>
            <div>
              <div className="text-sm font-mono text-stone-500">#{employee.employeeNumber || '—'}</div>
              <h1 className="text-3xl font-bold text-stone-800">{display}</h1>
              {hasNick && <div className="text-sm text-stone-500 mt-0.5">ชื่อจริง: {employee.name}</div>}
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {pos && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-sm font-medium rounded-md"><Award className="w-3.5 h-3.5" />{pos.name}</span>}
                {zone ? <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-700 text-sm rounded-md"><MapPin className="w-3.5 h-3.5" />{zone.name}</span>
                  : pos?.crossZone && <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 text-sm font-medium rounded-md"><MapPin className="w-3.5 h-3.5" />ไม่จำกัดโซน</span>}
                {employee.nationality && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-50 text-sky-800 text-sm rounded-md"><span className="leading-none">{natFlag(employee.nationality)}</span>{natLabel(employee.nationality)}</span>}
              </div>
              {additionalBizs.length > 0 && (
                <div className="mt-3 p-3 bg-sky-50/60 border border-sky-200 rounded-lg">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-sky-900 mb-1.5">
                    <Building2 className="w-3.5 h-3.5" />ดูแลธุรกิจ ({1 + additionalBizs.length} ที่)
                  </div>
                  <div className="space-y-1">
                    {[primaryBiz, ...additionalBizs].filter(Boolean).map((b, i) => {
                      const bp = positions.find((p) => p.id === businessPositionId(employee, b.id));
                      const bsal = businessBaseSalary(employee, b.id);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1 bg-white border border-stone-200 rounded text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="font-medium text-stone-800">{b.name}</span>
                            {i === 0 && <span className="text-[9px] text-emerald-600">หลัก</span>}
                            {bp && <span className="text-stone-500">• {bp.name}</span>}
                          </span>
                          {canRaise && bsal > 0 && <span className="text-stone-600">{fmtMoney(bsal)} ฿</span>}
                        </div>
                      );
                    })}
                  </div>
                  {canRaise && hasSalarySplit(employee) && <p className="text-[11px] text-sky-700 mt-1.5">แยกเงินเดือน + ทำสลิปแยกต่อธุรกิจ</p>}
                </div>
              )}
              {resigned && (
                <div className="mt-3 p-3 bg-stone-100 border border-stone-300 rounded-lg">
                  <div className="flex items-center gap-1.5 text-sm font-medium text-stone-700 mb-1">
                    <LogOut className="w-4 h-4" />ลาออกแล้ว
                  </div>
                  <div className="text-xs text-stone-600 space-y-0.5">
                    <div>วันที่ลาออก: <strong>{fmt(employee.resignedDate) || '—'}</strong></div>
                    <div>เหตุผล: <strong>{resignLabel(employee.resignReason)}</strong></div>
                    {employee.resignNote && <div>หมายเหตุ: {employee.resignNote}</div>}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-5">
                <InfoItem icon={Phone} label="เบอร์โทร" value={employee.phone} />
                <InfoItem icon={Mail} label="อีเมล" value={employee.email} />
                <InfoItem icon={Calendar} label="วันเริ่มงาน" value={fmt(employee.startDate)} hint={yos != null ? `${yos} ปี` : null} />
                <InfoItem icon={Calendar} label="วันเกิด" value={fmt(employee.birthDate)} />
                <InfoItem icon={UserCircle} label="หัวหน้าโดยตรง" value={dispName(mgr) || null} />
                <InfoItem icon={Shield} label="ผู้ติดต่อฉุกเฉิน" value={employee.emergencyContact} />
              </div>
            </div>
          </div>

          {foreign && (
            <div className="px-6 pb-2">
              <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Globe className="w-4 h-4 text-sky-700" />
                  <h3 className="text-sm font-medium text-sky-900">เอกสารแรงงานต่างด้าว</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div className="flex items-start gap-2.5">
                    <CreditCard className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-stone-500">บัตรแรงงาน</div>
                      <div className="text-sm text-stone-800">
                        {employee.hasWorkPermit === true ? (
                          <span className="inline-flex items-center gap-2">
                            <span className="font-medium">ทำแล้ว</span>
                            {permitStatus && <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded ${permitStatus.cls}`}>{permitStatus.label}</span>}
                          </span>
                        ) : employee.hasWorkPermit === false ? <span className="text-amber-700 font-medium">ยังไม่ทำบัตร</span>
                        : <span className="text-stone-400">—</span>}
                      </div>
                      {employee.workPermitExpiry && <div className="text-xs text-stone-500 mt-0.5">หมดอายุ {fmt(employee.workPermitExpiry)}</div>}
                      <DocList paths={employee.workPermitDocs} />
                    </div>
                  </div>
                  <div className="flex items-start gap-2.5">
                    <BookOpen className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-stone-500">พาสปอร์ต</div>
                      <div className="text-sm text-stone-800">
                        {employee.hasPassport === true ? <span className="font-medium">มี</span>
                        : employee.hasPassport === false ? <span className="text-amber-700">ไม่มี</span>
                        : <span className="text-stone-400">—</span>}
                      </div>
                      <DocList paths={employee.passportDocs} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {employee.applicationDocs?.length > 0 && (
            <div className="px-6 pb-2">
              <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Paperclip className="w-4 h-4 text-stone-600" />
                  <h3 className="text-sm font-medium text-stone-800">เอกสารสมัครงาน</h3>
                </div>
                <DocList paths={employee.applicationDocs} />
              </div>
            </div>
          )}

          {(employee.address || employee.nationalId || employee.idCardExpiry || employee.passportExpiry || employee.notes) && (
            <div className="px-6 pb-6 space-y-4 pt-4">
              {employee.address && <DetailBlock icon={MapPin} label="ที่อยู่" value={employee.address} />}
              {employee.nationalId && <DetailBlock icon={Shield} label="เลขบัตรประชาชน" value={employee.nationalId} mono />}
              {employee.idCardExpiry && <DetailBlock icon={Shield} label="บัตรประจำตัวหมดอายุ" value={`${fmt(employee.idCardExpiry)} • ${expLabel(employee.idCardExpiry)}`} />}
              {employee.passportExpiry && <DetailBlock icon={BookOpen} label="พาสปอร์ตหมดอายุ" value={`${fmt(employee.passportExpiry)} • ${expLabel(employee.passportExpiry)}`} />}
              {employee.notes && <DetailBlock icon={Edit2} label="บันทึกเพิ่มเติม" value={employee.notes} />}
            </div>
          )}
          {canRaise && (
            <div className="px-6 pb-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 flex-wrap"><Wallet className="w-4 h-4 text-stone-500" /><h3 className="font-medium text-stone-700">เงินเดือนปัจจุบัน {fmtMoney(employee.baseSalary)} ฿</h3>{employee.onProbation && Number(employee.probationSalary) > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 text-xs font-medium rounded"><Clock className="w-3 h-3" />ทดลองงาน {fmtMoney(employee.probationSalary)} ฿ • {employee.probationMonths || 0} รอบบิล</span>}</div>
                {!resigned && <button onClick={onRaise} className="flex items-center gap-1.5 px-3 py-1.5 text-emerald-700 hover:bg-emerald-50 border border-emerald-300 rounded-lg text-sm font-medium"><TrendingUp className="w-3.5 h-3.5" /> ปรับเงินเดือน</button>}
              </div>
              {salaryHistory === null ? (
                <div className="text-xs text-stone-400">กำลังโหลดประวัติ...</div>
              ) : salaryHistory.length === 0 ? (
                <div className="text-xs text-stone-400 italic">ยังไม่มีประวัติการปรับเงินเดือน</div>
              ) : (
                <div className="space-y-2">
                  {salaryHistory.map((sc) => {
                    const diff = Number(sc.newSalary) - Number(sc.oldSalary);
                    const pct = Number(sc.oldSalary) > 0 ? (diff / Number(sc.oldSalary)) * 100 : 0;
                    const pending = sc.status === 'pending';
                    return (
                      <div key={sc.id} className={`flex items-start gap-3 p-3 rounded-lg border ${pending ? 'bg-amber-50/50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${diff >= 0 ? 'bg-emerald-100' : 'bg-red-100'}`}>
                          {diff >= 0 ? <TrendingUp className="w-4 h-4 text-emerald-700" /> : <TrendingDown className="w-4 h-4 text-red-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-stone-800">{fmtMoney(sc.oldSalary)} → {fmtMoney(sc.newSalary)} ฿</span>
                            <span className={`text-xs font-medium ${diff >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>({diff >= 0 ? '+' : ''}{pct.toFixed(1)}%)</span>
                            {pending && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded"><Clock className="w-2.5 h-2.5" />รอมีผล</span>}
                          </div>
                          <div className="text-xs text-stone-500 mt-0.5">{salaryReasonLabel(sc.reason)} • มีผล {sc.effectiveDate ? `${MONTH_NAMES[new Date(sc.effectiveDate).getMonth()]} ${new Date(sc.effectiveDate).getFullYear() + 543}` : '—'}</div>
                          {sc.note && <div className="text-xs text-stone-400 mt-0.5">{sc.note}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {reports.length > 0 && (
            <div className="px-6 pb-6">
              <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-stone-500" /><h3 className="font-medium text-stone-700">ลูกน้องโดยตรง ({reports.length} คน)</h3></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {reports.map((r) => {
                  const rp = positions.find((p) => p.id === r.positionId);
                  return (<div key={r.id} className="flex items-center gap-3 p-2.5 bg-stone-50 rounded-lg"><Avatar photo={r.photo} name={dispName(r)} size={36} /><div className="min-w-0"><div className="text-sm font-medium text-stone-800 truncate"><span className="font-mono text-xs text-stone-400 mr-1.5">#{r.employeeNumber}</span>{dispName(r)}</div><div className="text-xs text-stone-500 truncate">{rp?.name || '—'}</div></div></div>);
                })}
              </div>
            </div>
          )}
        </div>
        {canWrite && (
          <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-between gap-2">
            <div>
              {canResign && (resigned ? (
                <button onClick={onRehire} className="flex items-center gap-2 px-4 py-2 text-emerald-700 hover:bg-emerald-50 border border-emerald-300 rounded-lg text-sm font-medium"><UserCircle className="w-4 h-4" /> จ้างกลับ</button>
              ) : (
                <button onClick={onResign} className="flex items-center gap-2 px-4 py-2 text-stone-700 hover:bg-stone-100 border border-stone-300 rounded-lg text-sm font-medium"><LogOut className="w-4 h-4" /> ลาออก</button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={onDelete} className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium"><Trash2 className="w-4 h-4" /> ลบ</button>
              {!resigned && <button onClick={onEdit} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Edit2 className="w-4 h-4" /> แก้ไข</button>}
            </div>
          </div>
        )}
      </div>
      {showCard && (
        <EmployeeIDCard employee={employee} business={primaryBiz} zone={zone} position={pos} onClose={() => setShowCard(false)} />
      )}
    </div>
  );
}

// ============ บัตรพนักงาน (ID CARD) — CR80 แนวตั้ง 54×85.6mm ============
// สร้าง QR code เป็น data URL (ใช้ lib qrcode-generator จาก CDN ใน index.html)
function makeQRDataUrl(text) {
  try {
    if (typeof window === 'undefined' || !window.qrcode) return null;
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createDataURL(5, 0);
  } catch { return null; }
}

// สีแบรนด์คงที่ (ไม่ตามธีม) เพื่อให้บัตรพิมพ์ออกมาตรงเสมอ
const CARD = {
  green1: '#065f46', green2: '#053d31', greenDeep: '#04332a',
  gold: '#d4a017', goldLight: '#f0b429', ink: '#1c1917', muted: '#9a958f', line: '#ece9e4',
};

function EmployeeIDCard({ employee, business, zone, position, onClose }) {
  const display = dispName(employee);
  const initials = display.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() || '?';
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');
  const hasRealNick = employee.nickname && employee.name && employee.nickname !== employee.name;

  // QR: เข้ารหัสรหัสพนักงาน + ชื่อ + บริษัท
  const qrText = `${business?.name || 'บริษัท'} | #${employee.employeeNumber || '-'} | ${display}${employee.phone ? ' | ' + employee.phone : ''}`;
  const [qrUrl, setQrUrl] = useState(() => makeQRDataUrl(qrText));
  useEffect(() => {
    if (qrUrl) return;
    let tries = 0;
    const t = setInterval(() => {
      const u = makeQRDataUrl(qrText);
      if (u || ++tries > 20) { if (u) setQrUrl(u); clearInterval(t); }
    }, 150);
    return () => clearInterval(t);
  }, []);

  const printCard = () => {
    const cardEl = document.getElementById('emp-id-card');
    if (!cardEl) return;
    const w = window.open('', '_blank', 'width=440,height=720');
    if (!w) { alert('กรุณาอนุญาต popup เพื่อพิมพ์บัตร'); return; }
    w.document.write(`<!DOCTYPE html><html lang="th"><head><title>บัตรพนักงาน - ${display}</title>
      <meta charset="utf-8" />
      <link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&family=Prompt:wght@300;400;500;600&display=swap" rel="stylesheet" />
      <style>
        @page { size: 54mm 85.6mm; margin: 0; }
        * { margin:0; padding:0; box-sizing:border-box; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        body { font-family:'Prompt',sans-serif; display:flex; align-items:center; justify-content:center; background:#e7e5e4; }
        .wrap { width:54mm; height:85.6mm; overflow:hidden; }
        .wrap > #emp-id-card { transform: scale(0.7559); transform-origin: top left; box-shadow:none !important; }
        @media print { body { background:#fff; } }
      </style></head><body>
      <div class="wrap">${cardEl.outerHTML}</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},500);};window.onafterprint=function(){window.close();};</script>
      </body></html>`);
    w.document.close();
  };

  const rows = [
    { icon: Hash, label: 'รหัสพนักงาน', value: `#${employee.employeeNumber || '—'}` },
    { icon: MapPin, label: 'สังกัด / โซน', value: zone?.name || (position?.crossZone ? 'ไม่จำกัดโซน' : '—') },
    { icon: Phone, label: 'เบอร์โทร', value: employee.phone || '—' },
    { icon: Calendar, label: 'เริ่มงาน', value: fmtDate(employee.startDate) },
  ];

  return (
    <div className="fixed inset-0 bg-stone-900/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4 overflow-auto" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex flex-col items-center gap-4 my-auto">
        {/* ===== บัตร (inline styles ทั้งหมด เพื่อพิมพ์ตรงจอ) ===== */}
        <div id="emp-id-card" style={{ width: '270px', height: '428px', position: 'relative', borderRadius: '16px', overflow: 'hidden', background: '#ffffff', boxShadow: '0 20px 50px rgba(0,0,0,0.35)', fontFamily: "'Prompt', sans-serif", border: `1px solid ${CARD.line}` }}>
          {/* แถบหัวโค้ง + ลายเส้น guilloché */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '136px', background: `linear-gradient(135deg, ${CARD.green1} 0%, ${CARD.greenDeep} 100%)`, borderBottomLeftRadius: '40px 22px', borderBottomRightRadius: '40px 22px' }}>
            <svg width="270" height="136" viewBox="0 0 270 136" style={{ position: 'absolute', inset: 0, opacity: 0.12 }} preserveAspectRatio="none">
              {[...Array(9)].map((_, i) => <ellipse key={i} cx="135" cy="20" rx={40 + i * 26} ry={14 + i * 9} fill="none" stroke="#ffffff" strokeWidth="0.6" />)}
            </svg>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px', background: `linear-gradient(90deg, ${CARD.gold}, ${CARD.goldLight}, ${CARD.gold})` }} />
          </div>

          {/* ลายน้ำโลโก้ */}
          <div style={{ position: 'absolute', top: '170px', left: 0, right: 0, display: 'flex', justifyContent: 'center', opacity: 0.05, pointerEvents: 'none' }}>
            {business?.logo ? <img src={business.logo} alt="" style={{ width: '150px', height: '150px', objectFit: 'contain' }} /> : <Building2 style={{ width: '150px', height: '150px', color: CARD.green1 }} />}
          </div>

          {/* หัว: โลโก้ + ชื่อบริษัท */}
          <div style={{ position: 'relative', padding: '14px 16px 0', display: 'flex', alignItems: 'center', gap: '8px', color: '#fff' }}>
            <div style={{ width: '34px', height: '34px', borderRadius: '9px', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, boxShadow: `0 0 0 1.5px ${CARD.gold}` }}>
              {business?.logo ? <img src={business.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <Building2 style={{ width: '18px', height: '18px', color: CARD.green1 }} />}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '11px', fontWeight: 600, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: "'Kanit', sans-serif" }}>{business?.name || 'บริษัท'}</div>
              <div style={{ fontSize: '7.5px', letterSpacing: '2.5px', color: CARD.goldLight, fontWeight: 500 }}>EMPLOYEE ID CARD</div>
            </div>
          </div>

          {/* รูปพนักงาน */}
          <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: '12px' }}>
            <div style={{ width: '106px', height: '106px', borderRadius: '14px', overflow: 'hidden', background: '#f5f5f4', boxShadow: `0 0 0 3px #ffffff, 0 0 0 5px ${CARD.gold}, 0 8px 18px rgba(0,0,0,0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {employee.photo ? <img src={employee.photo} alt={display} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', background: `linear-gradient(135deg, ${CARD.green1}, ${CARD.greenDeep})`, color: '#fff', fontSize: '32px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Kanit', sans-serif" }}>{initials}</div>}
            </div>
          </div>

          {/* ชื่อ + ตำแหน่ง */}
          <div style={{ position: 'relative', textAlign: 'center', padding: '0 14px', marginTop: '9px' }}>
            <div style={{ fontWeight: 700, color: CARD.ink, fontSize: '17px', lineHeight: 1.15, fontFamily: "'Kanit', sans-serif" }}>{display}</div>
            {hasRealNick && <div style={{ fontSize: '9.5px', color: CARD.muted, lineHeight: 1.3, marginTop: '1px' }}>{employee.name}</div>}
            <div style={{ display: 'inline-block', marginTop: '5px', padding: '2px 12px', background: `linear-gradient(90deg, ${CARD.gold}, ${CARD.goldLight})`, color: '#fff', fontSize: '10px', fontWeight: 600, borderRadius: '999px', fontFamily: "'Kanit', sans-serif", boxShadow: '0 2px 5px rgba(212,160,23,0.4)' }}>{position?.name || 'พนักงาน'}</div>
          </div>

          {/* ข้อมูล */}
          <div style={{ position: 'relative', padding: '0 18px', marginTop: '11px' }}>
            {rows.map((r, i) => {
              const Icon = r.icon;
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '7px', borderBottom: i < rows.length - 1 ? `1px solid ${CARD.line}` : 'none', padding: '4px 0' }}>
                  <Icon style={{ width: '12px', height: '12px', color: CARD.green1, flexShrink: 0 }} />
                  <span style={{ fontSize: '8.5px', color: CARD.muted, letterSpacing: '0.3px', flexShrink: 0, width: '62px' }}>{r.label}</span>
                  <span style={{ fontSize: '11px', fontWeight: 600, color: CARD.ink, textAlign: 'right', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.value}</span>
                </div>
              );
            })}
          </div>

          {/* ท้ายบัตร: QR + ป้าย */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
            <div style={{ background: '#faf9f7', borderTop: `1px solid ${CARD.line}`, padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '46px', height: '46px', borderRadius: '7px', background: '#fff', border: `1px solid ${CARD.line}`, padding: '2px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {qrUrl ? <img src={qrUrl} alt="QR" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} /> : <Building2 style={{ width: '20px', height: '20px', color: CARD.muted }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '7.5px', color: CARD.muted, letterSpacing: '1px' }}>STAFF ID</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: CARD.green1, fontFamily: "'Kanit', sans-serif", lineHeight: 1.1 }}>#{employee.employeeNumber || '—'}</div>
                <div style={{ fontSize: '7px', color: CARD.muted, lineHeight: 1.2, marginTop: '1px' }}>ทรัพย์สินของบริษัท · พบกรุณาส่งคืน</div>
              </div>
            </div>
            <div style={{ height: '5px', background: `linear-gradient(90deg, ${CARD.green1}, ${CARD.gold})` }} />
          </div>
        </div>

        {/* ปุ่ม */}
        <div className="flex gap-2">
          <button onClick={printCard} className="flex items-center gap-2 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium shadow-lg"><FileText className="w-4 h-4" /> พิมพ์ / บันทึก PDF</button>
          <button onClick={onClose} className="px-5 py-2.5 bg-white hover:bg-stone-100 text-stone-700 rounded-lg text-sm font-medium shadow-lg">ปิด</button>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value, hint }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon className="w-4 h-4 text-stone-400 mt-0.5 flex-shrink-0" />
      <div className="min-w-0"><div className="text-xs text-stone-500">{label}</div><div className="text-sm text-stone-800 break-words">{value || <span className="text-stone-400">—</span>}{hint && <span className="text-stone-500 text-xs ml-1.5">({hint})</span>}</div></div>
    </div>
  );
}

function DetailBlock({ icon: Icon, label, value, mono }) {
  return (
    <div className="bg-stone-50 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1.5"><Icon className="w-4 h-4 text-stone-500" /><div className="text-xs font-medium text-stone-600">{label}</div></div>
      <div className={`text-sm text-stone-800 whitespace-pre-wrap ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function EmployeeForm({ initial, zones, positions, allPositions, employees, businesses, onSave, onCancel, lockedZoneId, allowedZoneIds, businessId, isOwner, canEditPay }) {
  const [name, setName] = useState(initial?.name || '');
  const [nickname, setNickname] = useState(initial?.nickname || '');
  const [employeeNumber, setEmployeeNumber] = useState(initial?.employeeNumber || '');
  const [photo, setPhoto] = useState(initial?.photo || '');
  const [zoneId, setZoneId] = useState(initial?.zoneId || lockedZoneId || '');
  const [positionId, setPositionId] = useState(initial?.positionId || '');
  const [businessPositions, setBusinessPositions] = useState(initial?.businessPositions || {});
  const [managerId, setManagerId] = useState(initial?.managerId || '');
  const [additionalBusinessIds, setAdditionalBusinessIds] = useState(initial?.additionalBusinessIds || []);
  const [phone, setPhone] = useState(initial?.phone || '');
  const [email, setEmail] = useState(initial?.email || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [startDate, setStartDate] = useState(initial?.startDate || '');
  const [birthDate, setBirthDate] = useState(initial?.birthDate || '');
  const [nationalId, setNationalId] = useState(initial?.nationalId || '');
  const [idCardExpiry, setIdCardExpiry] = useState(initial?.idCardExpiry || '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergencyContact || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [nationality, setNationality] = useState(initial?.nationality || 'thai');
  const [hasWorkPermit, setHasWorkPermit] = useState(initial?.hasWorkPermit ?? null);
  const [workPermitExpiry, setWorkPermitExpiry] = useState(initial?.workPermitExpiry || '');
  const [hasPassport, setHasPassport] = useState(initial?.hasPassport ?? null);
  const [passportExpiry, setPassportExpiry] = useState(initial?.passportExpiry || '');
  const [workPermitDocs, setWorkPermitDocs] = useState(initial?.workPermitDocs || []);
  const [passportDocs, setPassportDocs] = useState(initial?.passportDocs || []);
  const [applicationDocs, setApplicationDocs] = useState(initial?.applicationDocs || []);
  const [baseSalary, setBaseSalary] = useState(initial?.baseSalary ?? '');
  const [salarySplitEnabled, setSalarySplitEnabled] = useState(!!(initial?.salarySplit && Object.keys(initial.salarySplit).length));
  const [salarySplit, setSalarySplit] = useState(initial?.salarySplit || {});
  const [onProbation, setOnProbation] = useState(initial?.onProbation ?? false);
  const [probationSalary, setProbationSalary] = useState(initial?.probationSalary ?? '');
  const [probationMonths, setProbationMonths] = useState(initial?.probationMonths ?? '');
  const [holidayQuota, setHolidayQuota] = useState(initial?.holidayQuota ?? 4);
  const [commissionPct, setCommissionPct] = useState(initial?.commissionPct ?? '');
  const [hasSocialSecurity, setHasSocialSecurity] = useState(initial?.hasSocialSecurity ?? false);
  const [roomFee, setRoomFee] = useState(initial?.roomFee ?? '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  // แยกเงินเดือนตามธุรกิจ: ธุรกิจหลัก + ธุรกิจเพิ่มเติม
  const mainBizId = initial?.businessId || businessId;
  const splitBizIds = [mainBizId, ...additionalBusinessIds].filter((v, i, a) => v && a.indexOf(v) === i);
  const splitTotal = splitBizIds.reduce((s, id) => s + (Number(salarySplit[id]) || 0), 0);
  const canSplit = splitBizIds.length > 1;
  const setSplitAmount = (id, val) => setSalarySplit((prev) => ({ ...prev, [id]: val }));
  const toggleSplit = () => {
    if (!salarySplitEnabled) {
      setSalarySplit((prev) => (Object.keys(prev).length ? prev : { [mainBizId]: Number(baseSalary) || 0 }));
      setSalarySplitEnabled(true);
    } else { setSalarySplitEnabled(false); }
  };
  const bizName = (id) => businesses?.find((b) => b.id === id)?.name || '—';

  const handlePhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setPhoto(await resizeImage(f, 400)); } finally { setUploading(false); }
  };

  const sel = positions.find((p) => p.id === positionId);
  const isCrossZone = sel?.crossZone;
  const foreign = isForeign(nationality);

  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อ');
    if (!zoneId && !isCrossZone) return alert('กรุณาเลือกโซน');
    onSave({
      name: name.trim(), nickname: nickname.trim() || null, photo,
      employeeNumber: employeeNumber.trim() || null,
      zoneId: zoneId || null, positionId: positionId || null, managerId: managerId || null,
      additionalBusinessIds: additionalBusinessIds.filter((id) => id !== businessId),
      businessPositions: (() => { const m = {}; additionalBusinessIds.forEach((bid) => { if (businessPositions[bid]) m[bid] = businessPositions[bid]; }); return Object.keys(m).length ? m : null; })(),
      phone: phone.trim(), email: email.trim(), address: address.trim(),
      startDate: startDate || null, birthDate: birthDate || null, nationalId: nationalId.trim(),
      idCardExpiry: idCardExpiry || null,
      emergencyContact: emergencyContact.trim(), notes: notes.trim(),
      nationality: nationality || null,
      hasWorkPermit: foreign ? hasWorkPermit : null,
      workPermitExpiry: foreign && hasWorkPermit === true ? (workPermitExpiry || null) : null,
      hasPassport: foreign ? hasPassport : null,
      passportExpiry: foreign && hasPassport === true ? (passportExpiry || null) : null,
      workPermitDocs: foreign ? workPermitDocs : [],
      passportDocs: foreign ? passportDocs : [],
      applicationDocs,
      ...(canEditPay ? {
        baseSalary: salarySplitEnabled ? splitTotal : (Number(baseSalary) || 0),
        salarySplit: salarySplitEnabled ? splitBizIds.reduce((o, id) => { o[id] = Number(salarySplit[id]) || 0; return o; }, {}) : null,
        commissionPct: commissionPct === '' ? null : Number(commissionPct),
        onProbation,
        probationSalary: onProbation ? (Number(probationSalary) || 0) : null,
        probationMonths: onProbation ? (Number(probationMonths) || null) : null,
        holidayQuota: Number(holidayQuota) || 0,
        hasSocialSecurity: !!hasSocialSecurity,
        roomFee: Number(roomFee) || 0,
      } : {}),
    });
  };

  return (
    <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-2">
      <div className="flex items-center gap-4">
        <div className="relative">
          <Avatar photo={photo} name={dispName({ nickname, name })} size={80} />
          <button onClick={() => fileRef.current?.click()} disabled={uploading} className="absolute -bottom-1 -right-1 w-7 h-7 bg-amber-500 hover:bg-amber-400 text-emerald-950 rounded-full flex items-center justify-center shadow-md disabled:opacity-50"><Camera className="w-3.5 h-3.5" /></button>
          <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
        </div>
        <div><div className="text-sm font-medium text-stone-700">รูปโปรไฟล์</div><div className="text-xs text-stone-500 mt-0.5">{uploading ? 'กำลังประมวลผล...' : 'คลิกที่ไอคอนกล้องเพื่ออัปโหลด'}</div></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField label="หมายเลขพนักงาน">
          <input value={employeeNumber} onChange={(e) => setEmployeeNumber(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 font-mono" placeholder={initial?.id ? '' : 'เว้นว่างเพื่อสร้างอัตโนมัติ'} />
          {!initial?.id && <p className="text-xs text-stone-500 mt-1">ถ้าเว้นว่าง ระบบจะใส่เลขถัดไปให้อัตโนมัติ (เช่น 001, 002, ...)</p>}
        </FormField>
        <div /> {/* spacer for grid alignment */}
        <FormField label="ชื่อ-นามสกุล" required><input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น สมชาย ใจดี" /></FormField>
        <FormField label="ชื่อเล่น"><input value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="ชื่อที่ใช้แสดงในระบบ" /></FormField>
        <FormField label="ตำแหน่ง">
          <select value={positionId} onChange={(e) => setPositionId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            <option value="">— ยังไม่กำหนด —</option>
            {positions.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crossZone ? ' (ไม่จำกัดโซน)' : ''}</option>)}
          </select>
        </FormField>
        <FormField label={isCrossZone ? 'โซน (ไม่จำเป็น)' : 'โซน'} required={!isCrossZone}>
          <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} disabled={!!lockedZoneId} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white disabled:bg-stone-100">
            <option value="">{isCrossZone ? '— ไม่จำกัดโซน —' : '— เลือกโซน —'}</option>
            {(allowedZoneIds && allowedZoneIds.length ? zones.filter((z) => allowedZoneIds.includes(z.id)) : zones).map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
          {isCrossZone && <p className="text-xs text-amber-700 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />ตำแหน่งนี้ไม่จำกัดโซน เลือกหรือเว้นว่างก็ได้</p>}
        </FormField>
        <FormField label="หัวหน้าโดยตรง">
          <select value={managerId} onChange={(e) => setManagerId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            <option value="">— ไม่มี —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>#{e.employeeNumber} {dispName(e)}{e.nickname && e.nickname !== e.name ? ` (${e.name})` : ''}</option>)}
          </select>
        </FormField>
        <FormField label="สัญชาติ">
          <select value={nationality} onChange={(e) => setNationality(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white">
            {NATIONALITIES.map((n) => <option key={n.value} value={n.value}>{n.flag} {n.label}</option>)}
          </select>
        </FormField>
        <FormField label="เบอร์โทร"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0XX-XXX-XXXX" /></FormField>
        <FormField label="อีเมล"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเริ่มงาน"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="วันเกิด"><input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label={nationality === 'thai' ? 'เลขบัตรประชาชน' : 'เลขบัตรประจำตัว'}><input value={nationalId} onChange={(e) => setNationalId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
        <FormField label="บัตรประจำตัวหมดอายุ"><input type="date" value={idCardExpiry} onChange={(e) => setIdCardExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" /><p className="text-xs text-stone-400 mt-1">เว้นว่างได้ถ้าไม่ต้องการให้เตือน</p></FormField>
        <FormField label="ผู้ติดต่อฉุกเฉิน"><input value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
      </div>

      {isOwner && businesses && businesses.length > 1 && (
        <FormField label="ดูแลธุรกิจเพิ่มเติม">
          <div className="space-y-2">
            <p className="text-xs text-stone-500 -mt-1">ปกติพนักงานสังกัดธุรกิจเดียว ติ๊กที่นี่ถ้าต้องดูแลธุรกิจอื่นด้วย (เช่น ผู้จัดการเขต)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {businesses.filter((b) => b.id !== businessId).map((b) => {
                const checked = additionalBusinessIds.includes(b.id);
                return (
                  <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer transition-all ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                    <input type="checkbox" checked={checked} onChange={(e) => {
                      if (e.target.checked) setAdditionalBusinessIds([...additionalBusinessIds, b.id]);
                      else setAdditionalBusinessIds(additionalBusinessIds.filter((id) => id !== b.id));
                    }} className="w-4 h-4 rounded text-emerald-700" />
                    <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                    <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                  </label>
                );
              })}
            </div>
          </div>
        </FormField>
      )}

      {isOwner && additionalBusinessIds.length > 0 && (
        <FormField label="ตำแหน่งในธุรกิจอื่น (รับหน้าที่ต่างกันได้)">
          <div className="space-y-2">
            <p className="text-xs text-stone-500 -mt-1">ตำแหน่งหลักด้านบนใช้กับ "{businesses?.find((b) => b.id === businessId)?.name || 'ธุรกิจหลัก'}" — ตั้งตำแหน่งของธุรกิจอื่นที่นี่ (เว้นว่าง = ใช้ตำแหน่งหลัก)</p>
            {additionalBusinessIds.map((bid) => {
              const b = businesses?.find((x) => x.id === bid);
              const opts = (allPositions || []).filter((p) => p.businessId === bid);
              return (
                <div key={bid} className="flex items-center gap-2">
                  <span className="text-xs text-stone-600 w-32 truncate flex-shrink-0" title={b?.name}>{b?.name || bid}</span>
                  <select value={businessPositions[bid] || ''} onChange={(e) => setBusinessPositions((prev) => { const n = { ...prev }; if (e.target.value) n[bid] = e.target.value; else delete n[bid]; return n; })} className="flex-1 px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
                    <option value="">— ใช้ตำแหน่งหลัก —</option>
                    {opts.map((p) => <option key={p.id} value={p.id}>{p.name}{p.crossZone ? ' (ไม่จำกัดโซน)' : ''}</option>)}
                  </select>
                </div>
              );
            })}
            {(allPositions || []).filter((p) => additionalBusinessIds.includes(p.businessId)).length === 0 && (
              <p className="text-xs text-amber-600">ธุรกิจที่เลือกยังไม่มีตำแหน่ง — ไปสร้างตำแหน่งในธุรกิจนั้นที่หน้า "ตำแหน่ง" ก่อน</p>
            )}
          </div>
        </FormField>
      )}

      {canEditPay && (
        <div className="bg-emerald-50/50 border border-emerald-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-emerald-700" />
            <h3 className="text-sm font-medium text-emerald-900">ข้อมูลค่าจ้าง (สำหรับคำนวณเงินเดือน)</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField label="เงินเดือนฐาน (บาท)">
              {!salarySplitEnabled ? (
                <>
                  <input type="number" min="0" step="0.01" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 12000" />
                  {Number(baseSalary) > 0 && <p className="text-xs text-stone-500 mt-1">ค่าแรง/วัน = {fmtMoney(Number(baseSalary) / 30)} บาท</p>}
                </>
              ) : (
                <div className="space-y-2">
                  {splitBizIds.map((id) => (
                    <div key={id} className="flex items-center gap-2">
                      <span className="text-xs text-stone-600 w-32 truncate flex-shrink-0" title={bizName(id)}>{bizName(id)}{id === mainBizId ? ' (หลัก)' : ''}</span>
                      <input type="number" min="0" step="0.01" value={salarySplit[id] ?? ''} onChange={(e) => setSplitAmount(id, e.target.value)} className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0" />
                    </div>
                  ))}
                  <div className="flex items-center justify-between text-sm pt-1 border-t border-emerald-100">
                    <span className="text-stone-600">รวมเงินเดือน</span>
                    <span className="font-semibold text-emerald-800">{fmtMoney(splitTotal)} ฿</span>
                  </div>
                </div>
              )}
              {canSplit && (
                <button type="button" onClick={toggleSplit} className="mt-2 text-xs text-emerald-700 hover:underline">
                  {salarySplitEnabled ? '↩ กลับไปใส่เงินเดือนก้อนเดียว' : '⊞ แยกเงินเดือนตามธุรกิจ (ทำงานหลายที่)'}
                </button>
              )}
            </FormField>
            <FormField label="โควต้าวันหยุด/เดือน">
              <input type="number" min="0" value={holidayQuota} onChange={(e) => setHolidayQuota(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 4" />
              <p className="text-xs text-stone-500 mt-1">หยุดเกินจากนี้จะถูกหักเป็นรายวัน</p>
            </FormField>
            <FormField label="% คอมมิชชั่น (ตั้งต้นในหน้าคอม)">
              <input type="number" min="0" step="0.001" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 4.3 (= 4.3%)" />
              <p className="text-xs text-stone-500 mt-1">เว้นว่างได้ถ้าไม่ได้คอมตาม % — ใส่คอมเป็นจำนวนเงินในหน้าคอมได้</p>
            </FormField>
            <FormField label="ค่าห้องพัก/เดือน (บาท)">
              <input type="number" min="0" step="0.01" value={roomFee} onChange={(e) => setRoomFee(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0 = ไม่พักห้องตลาด" />
            </FormField>
            <FormField label="ประกันสังคม">
              <label className="flex items-center gap-2 p-2.5 rounded-lg border-2 border-stone-200 cursor-pointer hover:border-stone-300 mt-0.5">
                <input type="checkbox" checked={hasSocialSecurity} onChange={(e) => setHasSocialSecurity(e.target.checked)} className="w-4 h-4 rounded text-emerald-700" />
                <span className="text-sm text-stone-700">มีประกันสังคม (หัก 5% สูงสุด 750)</span>
              </label>
            </FormField>
          </div>
          <div className="pt-3 border-t border-emerald-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={onProbation} onChange={(e) => setOnProbation(e.target.checked)} className="w-4 h-4 rounded text-emerald-700" />
              <span className="text-sm font-medium text-stone-700">อยู่ระหว่างทดลองงาน (เงินเดือนช่วงทดลองต่ำกว่าปกติ)</span>
            </label>
            {onProbation && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                <FormField label="เงินเดือนช่วงทดลองงาน (บาท)">
                  <input type="number" min="0" step="0.01" value={probationSalary} onChange={(e) => setProbationSalary(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 9000" />
                  <p className="text-xs text-stone-500 mt-1">เงินเดือนเต็มหลังผ่านทดลอง = {fmtMoney(Number(baseSalary) || 0)} บาท</p>
                </FormField>
                <FormField label="ทดลองงานกี่รอบบิล (เดือน)">
                  <input type="number" min="1" max="12" value={probationMonths} onChange={(e) => setProbationMonths(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น 2" />
                  <p className={`text-xs mt-1 ${startDate ? 'text-stone-500' : 'text-amber-600'}`}>{startDate ? `นับจากเดือนเริ่มงาน (${fmt(startDate)}) — ครบ ${Number(probationMonths) || 0} รอบบิลแล้วใช้เงินเดือนเต็มอัตโนมัติ` : 'ต้องระบุ "วันเริ่มงาน" ด้วย ระบบจึงนับรอบบิลได้'}</p>
                </FormField>
              </div>
            )}
          </div>
        </div>
      )}

      {foreign && (
        <div className="bg-sky-50/50 border border-sky-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-700" />
            <h3 className="text-sm font-medium text-sky-900">เอกสารแรงงานต่างด้าว</h3>
          </div>
          <FormField label="บัตรแรงงาน">
            <div className="grid grid-cols-2 gap-2">
              <PillRadio selected={hasWorkPermit === true} onClick={() => setHasWorkPermit(true)} icon={CheckCircle2}>ทำบัตรแล้ว</PillRadio>
              <PillRadio selected={hasWorkPermit === false} onClick={() => setHasWorkPermit(false)} icon={Clock}>ยังไม่ทำบัตร</PillRadio>
            </div>
          </FormField>
          {hasWorkPermit === true && (
            <>
              <FormField label="บัตรหมดอายุ">
                <input type="date" value={workPermitExpiry} onChange={(e) => setWorkPermitExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
              </FormField>
              <MultiDocUpload label="ไฟล์/รูปบัตรแรงงาน" paths={workPermitDocs} businessId={businessId} docType="work_permit" onChange={setWorkPermitDocs} />
            </>
          )}
          <FormField label="พาสปอร์ต">
            <div className="grid grid-cols-2 gap-2">
              <PillRadio selected={hasPassport === true} onClick={() => setHasPassport(true)} icon={BookOpen}>มีพาสปอร์ต</PillRadio>
              <PillRadio selected={hasPassport === false} onClick={() => setHasPassport(false)} icon={X}>ไม่มี</PillRadio>
            </div>
          </FormField>
          {hasPassport === true && (
            <>
              <FormField label="พาสปอร์ตหมดอายุ">
                <input type="date" value={passportExpiry} onChange={(e) => setPassportExpiry(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 bg-white" />
              </FormField>
              <MultiDocUpload label="ไฟล์/รูปพาสปอร์ต" paths={passportDocs} businessId={businessId} docType="passport" onChange={setPassportDocs} />
            </>
          )}
        </div>
      )}

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Paperclip className="w-4 h-4 text-stone-600" />
          <h3 className="text-sm font-medium text-stone-800">เอกสารสมัครงาน</h3>
        </div>
        <p className="text-xs text-stone-500 -mt-1">เช่น ใบสมัคร, สำเนาวุฒิการศึกษา, รูปถ่าย, เอกสารอ้างอิง (อัปโหลดได้ทุกคน ทั้งคนไทยและต่างชาติ)</p>
        <MultiDocUpload label="ไฟล์/รูปเอกสารสมัครงาน" paths={applicationDocs} businessId={businessId} docType="application" onChange={setApplicationDocs} />
      </div>

      <FormField label="ที่อยู่"><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormField label="บันทึกเพิ่มเติม"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

function PillRadio({ selected, onClick, icon: Icon, children }) {
  return (
    <button type="button" onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg border-2 transition-all ${selected ? 'border-emerald-600 bg-emerald-50 text-emerald-900 font-medium' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300'}`}>
      {Icon && <Icon className={`w-4 h-4 ${selected ? 'text-emerald-700' : 'text-stone-400'}`} />}
      {children}
    </button>
  );
}

function DocList({ paths }) {
  const list = Array.isArray(paths) ? paths : [];
  if (list.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {list.map((p, i) => <DocViewChip key={p} path={p} index={i} total={list.length} />)}
    </div>
  );
}

function DocViewChip({ path, index, total }) {
  const [opening, setOpening] = useState(false);
  const filename = path.split('/').pop() || '';
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    setOpening(true);
    const url = await getDocumentUrl(path);
    setOpening(false);
    if (url) window.open(url, '_blank');
  };
  const label = total > 1 ? `ไฟล์ ${index + 1}` : 'ดูไฟล์';
  return (
    <button type="button" onClick={open} disabled={opening} className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-md font-medium border border-emerald-200 disabled:opacity-50" title={filename}>
      {isPdf ? <FileText className="w-3 h-3" /> : <Paperclip className="w-3 h-3" />}
      {opening ? '...' : label}
    </button>
  );
}

function MultiDocUpload({ label, paths, businessId, docType, onChange }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const list = Array.isArray(paths) ? paths : [];

  const handlePick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    const oversized = files.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) return alert(`ไฟล์ ${oversized.name} ใหญ่เกิน 10MB`);
    setUploading(true);
    try {
      const uploaded = [];
      for (const f of files) {
        const p = await uploadDocument(f, businessId, docType);
        if (p) uploaded.push(p);
      }
      if (uploaded.length) onChange([...list, ...uploaded]);
    } finally {
      setUploading(false);
    }
  };

  const removeOne = async (path) => {
    if (!confirm('ลบไฟล์นี้?')) return;
    await deleteDocument(path);
    onChange(list.filter((p) => p !== path));
  };

  return (
    <div>
      <label className="block text-sm font-medium text-stone-700 mb-1.5">{label}{list.length > 0 && <span className="ml-2 text-xs text-stone-500">({list.length} ไฟล์)</span>}</label>
      <div className="space-y-2">
        {list.map((path) => (
          <DocItem key={path} path={path} onRemove={() => removeOne(path)} />
        ))}
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full flex items-center justify-center gap-2 px-3 py-2.5 border-2 border-dashed border-stone-300 hover:border-emerald-400 hover:bg-emerald-50/30 rounded-lg text-sm text-stone-600 hover:text-emerald-700 disabled:opacity-50">
          {uploading ? <><Clock className="w-4 h-4 animate-pulse" /> กำลังอัปโหลด...</> : <><Upload className="w-4 h-4" /> เพิ่มไฟล์{list.length > 0 ? ' (เลือกหลายไฟล์ได้)' : ' (รูปหรือ PDF, ไม่เกิน 10MB ต่อไฟล์)'}</>}
        </button>
      </div>
      <input ref={fileRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handlePick} className="hidden" />
    </div>
  );
}

function DocItem({ path, onRemove }) {
  const [opening, setOpening] = useState(false);
  const filename = path.split('/').pop() || 'ไฟล์';
  const isPdf = filename.toLowerCase().endsWith('.pdf');
  const open = async () => {
    setOpening(true);
    const url = await getDocumentUrl(path);
    setOpening(false);
    if (url) window.open(url, '_blank');
  };
  return (
    <div className="flex items-center gap-2 p-2.5 bg-white border border-stone-200 rounded-lg">
      <div className="w-9 h-9 rounded bg-emerald-50 flex items-center justify-center flex-shrink-0">
        {isPdf ? <FileText className="w-4 h-4 text-emerald-700" /> : <Paperclip className="w-4 h-4 text-emerald-700" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-stone-500 truncate" title={filename}>{filename}</div>
      </div>
      <button type="button" onClick={open} disabled={opening} className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-emerald-700 hover:bg-emerald-50 rounded-md font-medium disabled:opacity-50">
        <ExternalLink className="w-3.5 h-3.5" />{opening ? '...' : 'ดู'}
      </button>
      <button type="button" onClick={onRemove} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ============ ORG CHART ============
function OrgChartPage({ businesses, zones, positions, employees, profile, activeBusinessId }) {
  const isOwner = profile.isOwner;
  const isBM = profile.isBM;
  const isZM = profile.isZM;
  const isViewer = profile.isViewer;
  const visible = useMemo(() => {
    const act = employees.filter(isActive);
    // พนักงานอยู่ในธุรกิจนี้ ถ้าเป็นธุรกิจหลัก หรือเป็นหนึ่งในธุรกิจที่ดูแลเพิ่ม
    const inBiz = (e) => e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId);
    if (isOwner) return act.filter(inBiz);
    if (isBM) {
      const ids = profile.businessIds || [];
      const inScope = (e) => ids.includes(e.businessId) || (e.additionalBusinessIds || []).some((id) => ids.includes(id));
      return act.filter((e) => inScope(e) && (!activeBusinessId || inBiz(e)));
    }
    if (isZM) return act.filter((e) => (profile.zoneIds || []).includes(e.zoneId));
    if (isViewer) {
      const noScope = profile.businessIds.length === 0 && profile.zoneIds.length === 0;
      if (noScope) return act.filter(inBiz);
      return act.filter((e) => (profile.businessIds.includes(e.businessId) || profile.zoneIds.includes(e.zoneId)) && (!activeBusinessId || inBiz(e)));
    }
    return [];
  }, [employees, profile, activeBusinessId, isOwner, isBM, isZM, isViewer]);
  const roots = visible.filter((e) => !e.managerId || !visible.find((x) => x.id === e.managerId));

  if ((isOwner || isBM || isViewer) && !activeBusinessId) return <div className="h-full overflow-auto"><PageHeader title="แผนผังองค์กร" /><div className="p-8"><EmptyState icon={Network} title="เลือกธุรกิจที่ sidebar" description="แผนผังองค์กรเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>;

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="แผนผังองค์กร" subtitle="สายบังคับบัญชาตามที่กำหนด" />
      <div className="p-8">
        {visible.length === 0 ? <EmptyState icon={Network} title="ยังไม่มีพนักงาน" /> : (
          <div className="bg-white rounded-xl border border-stone-200 p-6 overflow-auto">
            <EmployeeTree employees={roots} allEmployees={visible} zones={zones} positions={positions} businesses={businesses} activeBusinessId={activeBusinessId} level={0} />
          </div>
        )}
      </div>
    </div>
  );
}

function EmployeeTree({ employees, allEmployees, zones, positions, businesses, activeBusinessId, level }) {
  return (
    <div className={level === 0 ? 'space-y-3' : 'mt-3 ml-8 pl-5 border-l-2 border-stone-200 space-y-3'}>
      {employees.map((emp) => {
        const reports = allEmployees.filter((e) => e.managerId === emp.id);
        const zone = zones.find((z) => z.id === emp.zoneId);
        const pos = positions.find((p) => p.id === businessPositionId(emp, activeBusinessId));
        // พนักงานข้ามธุรกิจ: ธุรกิจหลักไม่ใช่ธุรกิจที่กำลังดูอยู่
        const isGuest = activeBusinessId && emp.businessId !== activeBusinessId;
        const homeBiz = isGuest ? (businesses || []).find((b) => b.id === emp.businessId) : null;
        return (
          <div key={emp.id}>
            <div className="flex items-center gap-3 p-3 bg-stone-50 hover:bg-stone-100 rounded-lg">
              <Avatar photo={emp.photo} name={dispName(emp)} size={40} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-stone-800 truncate flex items-center gap-2">
                  <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                  <span className="truncate">{dispName(emp)}</span>
                  {isGuest && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-100 text-sky-700 text-[10px] font-medium rounded flex-shrink-0">
                      <Building2 className="w-2.5 h-2.5" />ข้ามธุรกิจ{homeBiz ? ` • ${homeBiz.name}` : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500 truncate">{pos?.name || '—'} {zone && `• ${zone.name}`}{reports.length > 0 && ` • ดูแล ${reports.length} คน`}</div>
              </div>
            </div>
            {reports.length > 0 && <EmployeeTree employees={reports} allEmployees={allEmployees} zones={zones} positions={positions} businesses={businesses} activeBusinessId={activeBusinessId} level={level + 1} />}
          </div>
        );
      })}
    </div>
  );
}

// ============ PAYROLL PAGE ============
// ============ ROOM RENT PAGE (ค่าห้องพนักงานจากมิเตอร์) ============
function RoomRentPage({ businesses, employees, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [rooms, setRooms] = useState([]);
  const [prevDate, setPrevDate] = useState('');
  const [currDate, setCurrDate] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [carried, setCarried] = useState(false);

  const business = businesses.find((b) => b.id === activeBusinessId);
  const bizEmployees = useMemo(() => employees.filter((e) => isActive(e) && (e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId))), [employees, activeBusinessId]);
  const empName = (id) => { const e = employees.find((x) => x.id === id); return e ? dispName(e) : '— ไม่พบ —'; };
  const newRoom = () => ({ id: `r${Date.now()}${Math.floor(Math.random() * 1000)}`, floor: '', roomNo: '', occupantText: '', occupantIds: [], rent: '', waterFlat: '', elecRate: 7, meterPrev: '', meterCurr: '', note: '' });
  const mapRoom = (r) => ({ ...newRoom(), ...r, occupantText: r.occupantText ?? r.label ?? '', rent: r.rent != null ? r.rent : (r.fixedExtra ?? '') });

  useEffect(() => {
    if (!activeBusinessId) return;
    let cancelled = false;
    setCarried(false);
    (async () => {
      const pool = await ops.roomRent.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      if (pool) {
        setRooms((pool.rooms || []).map(mapRoom));
        setPrevDate(pool.prevDate || ''); setCurrDate(pool.currDate || '');
        setNote(pool.note || ''); setSavedAt(pool.updatedAt || pool.createdAt || null);
        return;
      }
      const prev = month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
      const prevPool = await ops.roomRent.getByPeriod(activeBusinessId, prev.y, prev.m);
      if (cancelled) return;
      if (prevPool && (prevPool.rooms || []).length) {
        setRooms(prevPool.rooms.map((r) => ({ ...mapRoom(r), meterPrev: r.meterCurr ?? '', meterCurr: '' })));
        setPrevDate(prevPool.currDate || ''); setCurrDate('');
        setCarried(true);
      } else { setRooms([]); setPrevDate(''); setCurrDate(''); }
      setNote(''); setSavedAt(null);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month]);

  const setRoom = (id, patch) => setRooms((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  const addRoom = () => setRooms((rs) => [...rs, newRoom()]);
  const rmRoom = (id) => setRooms((rs) => rs.filter((r) => r.id !== id));
  const addOccupant = (roomId, empId) => { if (!empId) return; setRooms((rs) => rs.map((r) => r.id === roomId && !r.occupantIds.includes(empId) ? { ...r, occupantIds: [...r.occupantIds, empId] } : r)); };
  const rmOccupant = (roomId, empId) => setRooms((rs) => rs.map((r) => r.id === roomId ? { ...r, occupantIds: r.occupantIds.filter((x) => x !== empId) } : r));

  const grandTotal = rooms.reduce((s, r) => s + roomTotal(r), 0);
  const perEmp = roomRentMapFromPool({ rooms });

  const save = async () => {
    setSaving(true);
    const clean = rooms.map((r) => ({
      id: r.id, floor: r.floor || '', roomNo: r.roomNo || '', occupantText: r.occupantText || '',
      occupantIds: r.occupantIds || [], rent: Number(r.rent) || 0, waterFlat: Number(r.waterFlat) || 0,
      elecRate: Number(r.elecRate) || 0, meterPrev: Number(r.meterPrev) || 0, meterCurr: Number(r.meterCurr) || 0, note: r.note || '',
    }));
    const ok = await ops.roomRent.upsert({ businessId: activeBusinessId, periodYear: year, periodMonth: month, rooms: clean, prevDate: prevDate || null, currDate: currDate || null, note: note.trim() || null });
    setSaving(false);
    if (ok) { setSavedAt(new Date().toISOString()); setCarried(false); alert('บันทึกค่าห้องแล้ว — ยอดของผู้พักที่ผูกพนักงานไว้ จะไปขึ้นช่องค่าห้องในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];
  const cellInput = "w-full px-2 py-1.5 border border-stone-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-emerald-500/40";

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="ค่าห้องพนักงาน" /><div className="p-8"><EmptyState icon={KeyRound} title="เลือกธุรกิจที่ sidebar" description="ค่าห้องคิดแยกตามธุรกิจ/ตึก — เลือกธุรกิจก่อน" /></div></div>
  );

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ค่าห้องพนักงาน" subtitle={`${business?.name || ''} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-lg text-sm font-medium"><Check className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึกค่าห้อง'}</button>
      </PageHeader>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          <div className="flex items-center gap-1.5 text-sm"><span className="text-stone-500">วันจดมิเตอร์ครั้งก่อน</span><input type="date" value={prevDate} onChange={(e) => setPrevDate(e.target.value)} className="px-2 py-1.5 border border-stone-300 rounded-lg" /></div>
          <div className="flex items-center gap-1.5 text-sm"><span className="text-stone-500">ปัจจุบัน</span><input type="date" value={currDate} onChange={(e) => setCurrDate(e.target.value)} className="px-2 py-1.5 border border-stone-300 rounded-lg" /></div>
          {savedAt && <span className="text-xs text-stone-400">บันทึกล่าสุด {fmt(savedAt)}</span>}
        </div>

        {carried && (
          <div className="flex items-start gap-2 p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
            <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>ดึงรายการห้อง + เลขมิเตอร์เดือนก่อนมาให้แล้ว — <b>มิเตอร์ครั้งก่อน</b> เติมจากเลขล่าสุดอัตโนมัติ ใส่แค่เลขมิเตอร์ปัจจุบัน แล้วบันทึก</span>
          </div>
        )}

        {rooms.length === 0 ? (
          <EmptyState icon={KeyRound} title="ยังไม่มีห้อง" description="เพิ่มห้อง กรอกชั้น/เลขที่/ผู้พัก + เลขมิเตอร์ ระบบคิดค่าไฟ (หน่วย×เรต) + เหมาน้ำให้" action={<button onClick={addRoom} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มห้องแรก</button>} />
        ) : (
          <div className="overflow-x-auto border border-stone-200 rounded-xl bg-white">
            <table className="text-sm min-w-[1180px] w-full">
              <thead>
                <tr className="bg-stone-50 text-xs text-stone-500 border-b border-stone-200">
                  <th className="px-2 py-2 font-medium w-14">ชั้น</th>
                  <th className="px-2 py-2 font-medium w-16">เลขที่</th>
                  <th className="px-2 py-2 font-medium text-left min-w-[200px]">ผู้พัก</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าเช่า</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าน้ำเหมา</th>
                  <th className="px-2 py-2 font-medium w-28">มิเตอร์ก่อน{prevDate ? <div className="font-normal text-[10px]">{fmt(prevDate)}</div> : null}</th>
                  <th className="px-2 py-2 font-medium w-28">มิเตอร์ปัจจุบัน{currDate ? <div className="font-normal text-[10px]">{fmt(currDate)}</div> : null}</th>
                  <th className="px-2 py-2 font-medium w-16">ใช้ไป</th>
                  <th className="px-2 py-2 font-medium w-16">/หน่วย</th>
                  <th className="px-2 py-2 font-medium w-24">ค่าไฟรวม</th>
                  <th className="px-2 py-2 font-medium w-28">สรุปค่าเช่า</th>
                  <th className="px-2 py-2 font-medium text-left min-w-[140px]">หมายเหตุ</th>
                  <th className="px-2 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => {
                  const units = roomUnits(r);
                  const elec = units * (Number(r.elecRate) || 0);
                  const total = roomTotal(r);
                  const occ = (r.occupantIds || []).filter(Boolean);
                  const share = occ.length ? total / occ.length : 0;
                  const available = bizEmployees.filter((e) => !occ.includes(e.id));
                  return (
                    <tr key={r.id} className="border-b border-stone-100 align-top">
                      <td className="px-2 py-2"><input value={r.floor} onChange={(e) => setRoom(r.id, { floor: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded text-center" /></td>
                      <td className="px-2 py-2"><input value={r.roomNo} onChange={(e) => setRoom(r.id, { roomNo: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded text-center" /></td>
                      <td className="px-2 py-2">
                        <input value={r.occupantText} onChange={(e) => setRoom(r.id, { occupantText: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded" placeholder="เช่น ซัน+เมย์ / ว่าง" />
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {occ.map((id) => (
                            <span key={id} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[11px] rounded">{empName(id)}<button onClick={() => rmOccupant(r.id, id)}><X className="w-2.5 h-2.5" /></button></span>
                          ))}
                          {available.length > 0 && (
                            <select value="" onChange={(e) => { addOccupant(r.id, e.target.value); e.target.value = ''; }} className="text-[11px] px-1 py-0.5 border border-stone-200 rounded bg-white text-stone-500">
                              <option value="">+ ผูกเงินเดือน</option>
                              {available.map((e) => <option key={e.id} value={e.id}>{dispName(e)}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.rent} onChange={(e) => setRoom(r.id, { rent: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.waterFlat} onChange={(e) => setRoom(r.id, { waterFlat: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.meterPrev} onChange={(e) => setRoom(r.id, { meterPrev: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.meterCurr} onChange={(e) => setRoom(r.id, { meterCurr: e.target.value })} className={cellInput} placeholder="0" /></td>
                      <td className="px-2 py-2 text-right text-stone-600">{units}</td>
                      <td className="px-2 py-2"><input type="number" step="0.01" value={r.elecRate} onChange={(e) => setRoom(r.id, { elecRate: e.target.value })} className={cellInput} placeholder="7" /></td>
                      <td className="px-2 py-2 text-right text-stone-600">{fmtMoney(elec)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-emerald-800">{fmtMoney(total)}{occ.length > 1 ? <div className="text-[10px] font-normal text-stone-400">คนละ {fmtMoney(share)}</div> : null}</td>
                      <td className="px-2 py-2"><input value={r.note} onChange={(e) => setRoom(r.id, { note: e.target.value })} className="w-full px-2 py-1.5 border border-stone-200 rounded" placeholder="เช่น แจ้งพี่หนุ่ย" /></td>
                      <td className="px-2 py-2"><button onClick={() => rmRoom(r.id)} className="p-1 hover:bg-red-50 rounded text-red-500"><Trash2 className="w-4 h-4" /></button></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-stone-50 font-semibold text-stone-800 border-t-2 border-stone-200">
                  <td colSpan={10} className="px-2 py-2 text-right">รวมค่าห้องทั้งหมด</td>
                  <td className="px-2 py-2 text-right text-emerald-800">{fmtMoney(grandTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {rooms.length > 0 && (
          <button onClick={addRoom} className="w-full py-2.5 border-2 border-dashed border-stone-300 rounded-xl text-sm text-stone-500 hover:border-emerald-400 hover:text-emerald-700 flex items-center justify-center gap-1.5"><Plus className="w-4 h-4" />เพิ่มห้อง</button>
        )}

        {Object.keys(perEmp).length > 0 && (
          <div className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="text-sm font-medium text-stone-700 mb-2">ยอดที่จะหักเข้าเงินเดือน (เฉพาะผู้พักที่ผูกพนักงานไว้)</div>
            <div className="text-xs text-stone-500 space-y-0.5">
              {Object.entries(perEmp).map(([id, amt]) => (
                <div key={id} className="flex justify-between"><span>{empName(id)}</span><span>{fmtMoney(amt)} ฿</span></div>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-3">ยอดนี้จะไปขึ้นช่อง "ค่าห้องพัก" ในหน้าเงินเดือนงวดเดียวกันอัตโนมัติ (เฉพาะงวดที่ยังไม่ได้ทำ) — ผู้พักที่กรอกแค่ชื่อ (ไม่ผูกพนักงาน) จะถูกบันทึกไว้เฉยๆ ไม่หักเข้าเงินเดือน</p>
          </div>
        )}

        <FormField label="หมายเหตุงวดนี้"><textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg resize-none max-w-2xl" /></FormField>
      </div>
    </div>
  );
}

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
        setPosProfit(''); setPool2Total(''); setDeductions([]); setNote(''); setSavedAt(null);
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
    if (ok) { setSavedAt(new Date().toISOString()); alert('บันทึกคอมมิชชั่นแล้ว — ยอดจะไปขึ้นช่องคอมฯ ในหน้าเงินเดือนของงวดนี้อัตโนมัติ'); }
  };

  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="คอมมิชชั่น" /><div className="p-8"><EmptyState icon={Percent} title="เลือกธุรกิจที่ sidebar" description="คอมมิชชั่นคิดแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
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

function PayrollPage({ businesses, zones, positions, employees, activeBusinessId, ops }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1); // 1-12
  const [payrolls, setPayrolls] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEmp, setEditingEmp] = useState(null);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState('list'); // 'list' | 'quick'
  const [showPrintSlips, setShowPrintSlips] = useState(false);
  const [commissionPool, setCommissionPool] = useState(null);
  const [roomRentPool, setRoomRentPool] = useState(null);

  // พนักงานในธุรกิจนี้ — คนทำงานอยู่ + คนลาออกที่ยังมีงวดค้างจ่ายในเดือนนี้
  const payrollEmpIds = useMemo(() => new Set(payrolls.map((p) => p.employeeId)), [payrolls]);
  const bizEmployees = useMemo(() => {
    if (!activeBusinessId) return [];
    return employees.filter((e) => {
      // รวมพนักงานที่สังกัดธุรกิจนี้ (หลัก หรือ ธุรกิจเพิ่มเติม) — จ่ายเงินเดือนแยกต่อธุรกิจ
      const inBiz = e.businessId === activeBusinessId || (e.additionalBusinessIds || []).includes(activeBusinessId);
      if (!inBiz) return false;
      // ทำงานอยู่ → แสดงเสมอ / ลาออกแล้ว → แสดงเฉพาะถ้ามีงวด payroll ในเดือนนี้
      return isActive(e) || payrollEmpIds.has(e.id);
    });
  }, [employees, activeBusinessId, payrollEmpIds]);

  // โหลด payroll ของงวดนี้
  useEffect(() => {
    if (!activeBusinessId) { setPayrolls([]); setItems([]); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const ps = await ops.payroll.listByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      const its = await ops.payrollItem.listByPayrolls(ps.map((p) => p.id));
      if (cancelled) return;
      const pool = await ops.commission.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      const rrPool = await ops.roomRent.getByPeriod(activeBusinessId, year, month);
      if (cancelled) return;
      setPayrolls(ps); setItems(its); setCommissionPool(pool); setRoomRentPool(rrPool); setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeBusinessId, year, month, reload]);

  const payrollByEmp = useMemo(() => {
    const m = {}; payrolls.forEach((p) => { m[p.employeeId] = p; }); return m;
  }, [payrolls]);
  const itemsByPayroll = useMemo(() => {
    const m = {}; items.forEach((i) => { (m[i.payrollId] ||= []).push(i); }); return m;
  }, [items]);
  const commissionMap = useMemo(() => {
    const m = {}; (commissionPool?.entries || []).forEach((e) => { m[e.employeeId] = (Number(e.amount) || 0) + (Number(e.amount2) || 0); }); return m;
  }, [commissionPool]);
  const roomRentMap = useMemo(() => roomRentMapFromPool(roomRentPool), [roomRentPool]);

  const totalNet = useMemo(() => {
    return bizEmployees.reduce((sum, emp) => {
      const p = payrollByEmp[emp.id];
      if (!p) return sum;
      return sum + computePayroll(p, itemsByPayroll[p.id] || []).net;
    }, 0);
  }, [bizEmployees, payrollByEmp, itemsByPayroll]);

  const finalizedCount = payrolls.filter((p) => p.status === 'finalized').length;

  if (!activeBusinessId) return (
    <div className="h-full overflow-auto"><PageHeader title="เงินเดือน" /><div className="p-8"><EmptyState icon={Wallet} title="เลือกธุรกิจที่ sidebar" description="เงินเดือนคำนวณแยกตามธุรกิจ — เลือกธุรกิจก่อน" /></div></div>
  );

  const bizName = businesses.find((b) => b.id === activeBusinessId)?.name;
  const business = businesses.find((b) => b.id === activeBusinessId);
  const yearOptions = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  // พิมพ์รายงานรวม: ทุกคนในธุรกิจ (คนยังไม่ทำขึ้นว่าง)
  const printReport = () => {
    const rows = bizEmployees.map((emp) => {
      const p = payrollByEmp[emp.id];
      return {
        emp,
        position: positions.find((x) => x.id === businessPositionId(emp, activeBusinessId)),
        payroll: p || null,
        calc: p ? computePayroll(p, itemsByPayroll[p.id] || []) : null,
      };
    });
    printPayrollRegister({ business, rows, year, month });
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="เงินเดือน" subtitle={`${bizName} — งวด ${MONTH_NAMES[month - 1]} ${year + 543} (จ่าย ${payMonthLabel(year, month)})`}>
        <button onClick={() => setShowPrintSlips(true)} disabled={payrolls.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed text-stone-700 rounded-lg text-sm font-medium">
          <FileText className="w-4 h-4" /> พิมพ์สลิป
        </button>
        <button onClick={printReport} disabled={bizEmployees.length === 0} className="flex items-center gap-2 px-4 py-2 bg-white border border-stone-300 hover:bg-stone-50 disabled:opacity-50 disabled:cursor-not-allowed text-stone-700 rounded-lg text-sm font-medium">
          <FileText className="w-4 h-4" /> พิมพ์รายงานรวม
        </button>
      </PageHeader>
      <div className="p-4 md:p-8">
        {/* ตัวเลือกเดือน + สรุป */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {MONTH_NAMES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40">
            {yearOptions.map((y) => <option key={y} value={y}>{y + 543}</option>)}
          </select>
          {/* สลับโหมด */}
          <div className="inline-flex rounded-lg border border-stone-300 overflow-hidden">
            <button onClick={() => setMode('list')} className={`px-3 py-2 text-sm font-medium ${mode === 'list' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>รายคน</button>
            <button onClick={() => setMode('quick')} className={`px-3 py-2 text-sm font-medium ${mode === 'quick' ? 'bg-emerald-900 text-white' : 'bg-white text-stone-600 hover:bg-stone-50'}`}>กรอกเร็ว</button>
          </div>
          <div className="flex-1" />
          <div className="flex gap-3">
            <div className="px-4 py-2 bg-white border border-stone-200 rounded-lg">
              <div className="text-xs text-stone-500">ทำแล้ว</div>
              <div className="text-sm font-semibold text-stone-800">{payrolls.length}/{bizEmployees.length} คน {finalizedCount > 0 && <span className="text-emerald-600">(ปิดงวด {finalizedCount})</span>}</div>
            </div>
            <div className="px-4 py-2 bg-emerald-900 text-white rounded-lg">
              <div className="text-xs text-emerald-200">ยอดจ่ายรวม</div>
              <div className="text-sm font-semibold">{fmtMoney(totalNet)} ฿</div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-16 text-stone-400">กำลังโหลด...</div>
        ) : bizEmployees.length === 0 ? (
          <EmptyState icon={Users} title="ยังไม่มีพนักงาน" description="เพิ่มพนักงานก่อนที่หน้า 'พนักงาน'" />
        ) : mode === 'quick' ? (
          <PayrollQuickEntry
            bizEmployees={bizEmployees} positions={positions}
            payrollByEmp={payrollByEmp} itemsByPayroll={itemsByPayroll} commissionMap={commissionMap} roomRentMap={roomRentMap}
            year={year} month={month} businessId={activeBusinessId} ops={ops}
            onSaved={() => setReload((r) => r + 1)}
            onOpenDetail={(emp) => setEditingEmp(emp)}
          />
        ) : (
          <div className="space-y-2">
            {bizEmployees.map((emp) => {
              const p = payrollByEmp[emp.id];
              const calc = p ? computePayroll(p, itemsByPayroll[p.id] || []) : null;
              const pos = positions.find((x) => x.id === businessPositionId(emp, activeBusinessId));
              const bizBase = businessBaseSalary(emp, activeBusinessId);
              const noSalary = !bizBase || bizBase <= 0;
              return (
                <div key={emp.id} className={`bg-white rounded-xl border-2 ${p?.status === 'finalized' ? 'border-emerald-300' : 'border-stone-200'} p-4 flex items-center gap-4 hover:shadow-sm transition-all`}>
                  <Avatar photo={emp.photo} name={dispName(emp)} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-stone-400">#{emp.employeeNumber}</span>
                      <span className="font-medium text-stone-800 truncate">{dispName(emp)}</span>
                      {p?.status === 'finalized' && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-medium rounded"><CheckCircle2 className="w-2.5 h-2.5" />ปิดงวดแล้ว</span>}
                    </div>
                    <div className="text-sm text-stone-500 truncate">{pos?.name || 'ยังไม่กำหนดตำแหน่ง'} • ฐาน {fmtMoney(bizBase)} ฿</div>
                  </div>
                  <div className="text-right">
                    {noSalary ? (
                      <span className="text-xs text-amber-600">ยังไม่ตั้งเงินเดือน</span>
                    ) : calc ? (
                      <>
                        <div className="text-xs text-stone-400">สุทธิ</div>
                        <div className="font-semibold text-emerald-700">{fmtMoney(calc.net)} ฿</div>
                      </>
                    ) : (
                      <span className="text-xs text-stone-400">ยังไม่ทำ</span>
                    )}
                  </div>
                  <button onClick={() => setEditingEmp(emp)} disabled={noSalary} className="px-3 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium flex items-center gap-1.5">
                    <Calculator className="w-4 h-4" />{p ? 'แก้ไข' : 'ทำ'}
                  </button>
                  {p && (
                    <button onClick={() => printPayslip({ employee: emp, payroll: p, items: itemsByPayroll[p.id] || [], business: businesses.find((b) => b.id === activeBusinessId), position: positions.find((x) => x.id === businessPositionId(emp, activeBusinessId)), year, month })} title="พิมพ์สลิปเงินเดือน" className="px-3 py-2 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                      <FileText className="w-4 h-4" /><span className="hidden sm:inline">สลิป</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingEmp && (
        <PayrollEditor
          employee={editingEmp}
          existing={payrollByEmp[editingEmp.id]}
          existingItems={payrollByEmp[editingEmp.id] ? (itemsByPayroll[payrollByEmp[editingEmp.id].id] || []) : []}
          year={year} month={month} businessId={activeBusinessId} businessName={bizName}
          commissionPrefill={commissionMap[editingEmp.id] || 0}
          roomFeePrefill={roomRentMap[editingEmp.id]}
          ops={ops}
          onClose={() => setEditingEmp(null)}
          onSaved={() => { setEditingEmp(null); setReload((r) => r + 1); }}
        />
      )}
      {showPrintSlips && (
        <PrintSlipsModal
          business={business}
          bizEmployees={bizEmployees}
          payrollByEmp={payrollByEmp}
          itemsByPayroll={itemsByPayroll}
          positions={positions}
          activeBusinessId={activeBusinessId}
          year={year} month={month}
          onClose={() => setShowPrintSlips(false)}
        />
      )}
    </div>
  );
}

// ============ PRINT SLIPS MODAL (ฟอร์มพิมพ์สลิปรายคน) ============
function PrintSlipsModal({ business, bizEmployees, payrollByEmp, itemsByPayroll, positions, activeBusinessId, year, month, onClose }) {
  // เฉพาะคนที่ทำเงินเดือนงวดนี้แล้ว (มีสลิปให้พิมพ์)
  const rows = bizEmployees.filter((e) => payrollByEmp[e.id]).map((e) => ({
    emp: e,
    payroll: payrollByEmp[e.id],
    items: itemsByPayroll[payrollByEmp[e.id].id] || [],
    position: positions.find((x) => x.id === businessPositionId(e, activeBusinessId)),
  }));
  const [selected, setSelected] = useState(() => new Set(rows.map((r) => r.emp.id)));
  const toggle = (id) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = selected.size === rows.length && rows.length > 0;
  const toggleAll = () => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.emp.id)));

  const argsFor = (r) => ({ employee: r.emp, payroll: r.payroll, items: r.items, business, position: r.position, year, month });
  const printOne = (r) => printPayslip(argsFor(r));
  const printSelected = () => {
    const list = rows.filter((r) => selected.has(r.emp.id)).map(argsFor);
    printPayslips(list, year, month);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[88vh] flex flex-col">
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
          <div>
            <div className="font-semibold text-stone-800">พิมพ์สลิปเงินเดือน</div>
            <div className="text-xs text-stone-500">{business?.name} • {MONTH_NAMES[month - 1]} {year + 543}</div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>

        {rows.length === 0 ? (
          <div className="p-8 text-center text-stone-400 text-sm">ยังไม่มีพนักงานที่ทำเงินเดือนงวดนี้ — ทำเงินเดือนก่อนถึงจะพิมพ์สลิปได้</div>
        ) : (
          <>
            <div className="px-5 py-2 border-b border-stone-100 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
                <input type="checkbox" checked={allOn} onChange={toggleAll} className="w-4 h-4 rounded text-emerald-700" />
                เลือกทั้งหมด ({selected.size}/{rows.length})
              </label>
            </div>
            <div className="p-3 overflow-auto space-y-1.5 flex-1">
              {rows.map((r) => {
                const calc = computePayroll(r.payroll, r.items);
                const on = selected.has(r.emp.id);
                return (
                  <div key={r.emp.id} className={`flex items-center gap-3 p-2.5 rounded-lg border ${on ? 'border-emerald-300 bg-emerald-50/40' : 'border-stone-200'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(r.emp.id)} className="w-4 h-4 rounded text-emerald-700 flex-shrink-0" />
                    <Avatar photo={r.emp.photo} name={dispName(r.emp)} size={34} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-stone-800 truncate text-sm"><span className="font-mono text-xs text-stone-400 mr-1">#{r.emp.employeeNumber}</span>{dispName(r.emp)}</div>
                      <div className="text-xs text-stone-500">{r.position?.name || '—'} • สุทธิ {fmtMoney(calc.net)} ฿{r.payroll.status === 'finalized' && <span className="text-emerald-600"> • ปิดงวดแล้ว</span>}</div>
                    </div>
                    <button onClick={() => printOne(r)} title="พิมพ์สลิปคนนี้" className="flex-shrink-0 px-3 py-1.5 bg-white border border-stone-300 hover:bg-stone-50 text-stone-700 rounded-lg text-sm font-medium flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />พิมพ์
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-between items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ปิด</button>
              <button onClick={printSelected} disabled={selected.size === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
                <FileText className="w-4 h-4" />พิมพ์ที่เลือก ({selected.size})
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ============ STABLE INPUT COMPONENTS (ระดับโมดูล — กันช่องกรอกเสียโฟกัสตอนพิมพ์) ============
function EditorRow({ label, children, hint }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</div>
      <div className="w-36">{children}</div>
    </div>
  );
}
function EditorItemList({ title, list, setList, color, addLabel, disabled }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-stone-600">{title}</span>
        {!disabled && <button type="button" onClick={() => setList([...list, { label: '', amount: '' }])} className={`text-xs ${color} hover:underline flex items-center gap-0.5`}><Plus className="w-3 h-3" />{addLabel}</button>}
      </div>
      <div className="space-y-1.5">
        {list.length === 0 && <div className="text-xs text-stone-400 italic">ไม่มี</div>}
        {list.map((it, idx) => (
          <div key={idx} className="flex gap-2">
            <input disabled={disabled} value={it.label} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, label: e.target.value } : x))} placeholder="รายการ" className="flex-1 px-2 py-1.5 text-sm border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
            <input disabled={disabled} type="number" min="0" step="0.01" value={it.amount} onChange={(e) => setList(list.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} placeholder="0.00" className="w-28 px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
            {!disabled && <button type="button" onClick={() => setList(list.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ PAYROLL EDITOR MODAL ============
function PayrollEditor({ employee, existing, existingItems, year, month, businessId, businessName, commissionPrefill, roomFeePrefill, ops, onClose, onSaved }) {
  const isFinalized = existing?.status === 'finalized';
  const [unlocked, setUnlocked] = useState(false);
  const locked = isFinalized && !unlocked;
  // ค่าตั้งต้น: ถ้ามี payroll แล้วใช้ค่าเดิม ถ้าไม่มีดึงจากข้อมูลพนักงาน
  const [f, setF] = useState(() => ({
    baseSalary: existing?.baseSalary ?? payrollBaseSalaryForBiz(employee, businessId, year, month),
    holidayQuota: existing?.holidayQuota ?? employee.holidayQuota ?? 4,
    commission: existing?.commission ?? commissionPrefill ?? 0,
    holidayWorkDays: existing?.holidayWorkDays ?? 0,
    holidayDaysTaken: existing?.holidayDaysTaken ?? 0,
    lateDeduction: existing?.lateDeduction ?? 0,
    socialSecurity: existing?.socialSecurity ?? (employee.hasSocialSecurity ? calcSocialSecurity(payrollBaseSalaryForBiz(employee, businessId, year, month)) : 0),
    roomFee: existing?.roomFee ?? (roomFeePrefill != null ? roomFeePrefill : (employee.roomFee ?? 0)),
    paidViaCompany: existing?.paidViaCompany ?? 0,
    note: existing?.note ?? '',
  }));
  const [bonusTasks, setBonusTasks] = useState(existingItems.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount })));
  const [advances, setAdvances] = useState(existingItems.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount })));
  const [otherDeductions, setOtherDeductions] = useState(existingItems.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const allItems = [
    ...bonusTasks.map((i) => ({ ...i, kind: 'bonus_task' })),
    ...advances.map((i) => ({ ...i, kind: 'advance' })),
    ...otherDeductions.map((i) => ({ ...i, kind: 'other_deduction' })),
  ];
  const calc = computePayroll(f, allItems);

  const save = async (finalize) => {
    setSaving(true);
    try {
      const payload = {
        employeeId: employee.id, businessId, periodYear: year, periodMonth: month,
        baseSalary: Number(f.baseSalary) || 0, dailyRate: (Number(f.baseSalary) || 0) / 30,
        holidayQuota: Number(f.holidayQuota) || 0,
        commission: Number(f.commission) || 0,
        holidayWorkDays: Number(f.holidayWorkDays) || 0,
        holidayDaysTaken: Number(f.holidayDaysTaken) || 0,
        lateDeduction: Number(f.lateDeduction) || 0,
        socialSecurity: Number(f.socialSecurity) || 0,
        roomFee: Number(f.roomFee) || 0,
        paidViaCompany: Number(f.paidViaCompany) || 0,
        note: f.note || null,
        status: finalize ? 'finalized' : 'draft',
        finalizedAt: finalize ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      };
      const saved = await ops.payroll.upsert(payload);
      if (!saved) { setSaving(false); return; }
      // ลบ items เก่าทั้งหมด แล้วใส่ใหม่
      const oldItems = await ops.payrollItem.listByPayrolls([saved.id]);
      for (const it of oldItems) await ops.payrollItem.delete(it.id);
      for (const it of allItems) {
        if (!it.label?.trim() && !Number(it.amount)) continue;
        await ops.payrollItem.add({ payrollId: saved.id, kind: it.kind, label: it.label?.trim() || '-', amount: Number(it.amount) || 0 });
      }
      onSaved();
    } finally { setSaving(false); }
  };

  const numInput = (k, opts = {}) => (
    <input type="number" min="0" step="0.01" disabled={locked || opts.disabled} value={f[k]} onChange={(e) => set(k, e.target.value)} className="w-full px-2 py-1.5 text-sm border border-stone-300 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
  );

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Avatar photo={employee.photo} name={dispName(employee)} size={40} />
            <div>
              <div className="font-semibold text-stone-800">{dispName(employee)} <span className="font-mono text-xs text-stone-400">#{employee.employeeNumber}</span></div>
              <div className="text-xs text-stone-500">{businessName ? `${businessName} • ` : ''}{MONTH_NAMES[month - 1]} {year + 543}{isFinalized && ' • ปิดงวดแล้ว'}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-6 overflow-auto space-y-5">
          {locked && (
            <div className="flex items-center justify-between gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
              <div className="flex items-start gap-2"><CheckCircle2 className="w-4 h-4 mt-0.5" /><div>งวดนี้ปิดแล้ว — กด "แก้ไขงวดนี้" ถ้าคิดผิด/ต้องการแก้</div></div>
              <button onClick={() => setUnlocked(true)} className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-xs font-medium"><Edit2 className="w-3.5 h-3.5" />แก้ไขงวดนี้</button>
            </div>
          )}
          {isFinalized && unlocked && (
            <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <Edit2 className="w-4 h-4 mt-0.5" /><div>กำลังแก้งวดที่ปิดแล้ว — แก้ตัวเลขแล้วเลือก "บันทึก (คงปิดงวด)" หรือ "เปิดเป็นร่าง" ด้านล่าง</div>
            </div>
          )}

          {/* รายรับ */}
          <div className="bg-emerald-50/40 rounded-xl p-4">
            {isProbationPeriod(employee, year, month) && (
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>อยู่ช่วง<b>ทดลองงาน</b> (รอบบิลที่ {probationCycle(employee, year, month)}/{employee.probationMonths}) — ตั้งต้นด้วยเงินเดือนทดลอง <b>{fmtMoney(employee.probationSalary)} ฿</b> (เงินเดือนเต็มหลังผ่าน: {fmtMoney(employee.baseSalary)} ฿) ปรับตัวเลขด้านล่างได้</span>
              </div>
            )}
            {prorationFactor(employee, year, month) < 1 && (
              <div className="flex items-start gap-2 mb-3 p-2.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
                <Calendar className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>เริ่มงานกลางเดือน ({fmt(employee.startDate)}) — <b>เฉลี่ยเงินเดือน</b>ตามวันที่ทำจริง {daysInMonth(year, month) - new Date(employee.startDate).getDate() + 1}/{daysInMonth(year, month)} วัน = ตั้งต้น <b>{fmtMoney(payrollBaseSalary(employee, year, month))} ฿</b> (เต็มเดือน {fmtMoney(effectiveBaseSalary(employee, year, month))} ฿) ปรับได้</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm font-semibold text-emerald-800 mb-2"><TrendingUp className="w-4 h-4" />รายรับ</div>
            <EditorRow label="เงินเดือนฐาน" hint={`ค่าแรง/วัน = ${fmtMoney(calc.daily)} ฿`}>{numInput('baseSalary')}</EditorRow>
            <EditorRow label="คอมมิชชั่น" hint={!existing && commissionPrefill ? 'จากหน้าคอมมิชชั่นงวดนี้' : undefined}>{numInput('commission')}</EditorRow>
            <EditorRow label="ทำงานวันหยุด (วัน)" hint={`+${fmtMoney(calc.holidayWorkPay)} ฿`}>{numInput('holidayWorkDays')}</EditorRow>
            <div className="mt-2 pt-2 border-t border-emerald-100"><EditorItemList title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่มงานเสริม" disabled={locked} /></div>
          </div>

          {/* วันหยุด */}
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="text-sm font-semibold text-stone-700 mb-2">วันหยุด</div>
            <EditorRow label="โควต้าวันหยุดเดือนนี้">{numInput('holidayQuota')}</EditorRow>
            <EditorRow label="วันหยุดที่ใช้จริง" hint={calc.excessDays > 0 ? `เกิน ${calc.excessDays} วัน → หัก ${fmtMoney(calc.excessHolidayDeduction)} ฿` : 'ไม่เกินโควต้า'}>{numInput('holidayDaysTaken')}</EditorRow>
          </div>

          {/* รายการหัก */}
          <div className="bg-red-50/40 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-red-700 mb-2"><TrendingDown className="w-4 h-4" />รายการหัก</div>
            {calc.excessHolidayDeduction > 0 && <EditorRow label="หักหยุดเกิน (อัตโนมัติ)"><div className="text-right text-sm text-red-600 py-1.5">−{fmtMoney(calc.excessHolidayDeduction)}</div></EditorRow>}
            <EditorRow label="หักมาสาย">{numInput('lateDeduction')}</EditorRow>
            <EditorRow label="ประกันสังคม" hint={employee.hasSocialSecurity ? '5% ของฐาน สูงสุด 750' : 'พนักงานนี้ไม่มี ปกส.'}>{numInput('socialSecurity')}</EditorRow>
            <EditorRow label="ค่าห้องพัก" hint={!existing && roomFeePrefill != null ? 'จากหน้าค่าห้อง (มิเตอร์) งวดนี้' : undefined}>{numInput('roomFee')}</EditorRow>
            <EditorRow label="รับผ่านบัญชี บ.วีเอสจง แล้ว" hint="เงินที่จ่ายไปแล้ว">{numInput('paidViaCompany')}</EditorRow>
            <div className="mt-2 pt-2 border-t border-red-100 space-y-3">
              <EditorItemList title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่มการเบิก" disabled={locked} />
              <EditorItemList title="หักอื่นๆ" list={otherDeductions} setList={setOtherDeductions} color="text-red-600" addLabel="เพิ่มรายการหัก" disabled={locked} />
            </div>
          </div>

          <FormField label="หมายเหตุ"><textarea disabled={locked} value={f.note} onChange={(e) => set('note', e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" /></FormField>

          {/* สรุป */}
          <div className="bg-emerald-900 text-white rounded-xl p-4">
            <div className="flex justify-between text-sm text-emerald-100"><span>รายรับรวม</span><span>{fmtMoney(calc.totalIncome)} ฿</span></div>
            <div className="flex justify-between text-sm text-emerald-100 mt-1"><span>หักรวม</span><span>−{fmtMoney(calc.totalDeduction)} ฿</span></div>
            <div className="flex justify-between items-center mt-2 pt-2 border-t border-emerald-700">
              <span className="font-semibold">เงินเดือนสุทธิ</span>
              <span className="text-xl font-bold text-amber-300">{fmtMoney(calc.net)} ฿</span>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          {locked ? (
            <button onClick={() => setUnlocked(true)} className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-sm font-medium"><Edit2 className="w-4 h-4" />แก้ไขงวดนี้</button>
          ) : isFinalized && unlocked ? (
            <>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-amber-700 hover:bg-amber-50 border border-amber-300 rounded-lg text-sm font-medium">บันทึก + เปิดเป็นร่าง</button>
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก (คงปิดงวด)'}</button>
            </>
          ) : (
            <>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">{saving ? 'กำลังบันทึก...' : 'บันทึกร่าง'}</button>
              <button onClick={() => save(true)} disabled={saving} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><CheckCircle2 className="w-4 h-4" />บันทึก + ปิดงวด</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ PAYROLL QUICK ENTRY (Spreadsheet / Cards) ============
function PayrollQuickEntry({ bizEmployees, positions, payrollByEmp, itemsByPayroll, commissionMap, roomRentMap, year, month, businessId, ops, onSaved, onOpenDetail }) {
  const isMobile = useIsMobile();
  const [drafts, setDrafts] = useState({});
  const [touched, setTouched] = useState(() => new Set());
  const [itemsEmp, setItemsEmp] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pastBonus, setPastBonus] = useState([]);

  // ดึงรายการงานเสริมที่เคยใช้ในอดีต (เช่น ล้างห้องน้ำ) + ค่าตั้งต้นที่ทำประจำ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const labels = ops.payrollItem.distinctLabels ? await ops.payrollItem.distinctLabels('bonus_task') : [];
      if (!cancelled) setPastBonus([...new Set(['ล้างห้องน้ำ', ...labels])]);
    })();
    return () => { cancelled = true; };
  }, []);

  // "เบิกล่วงหน้า" จัดการเป็นรายการ advance ที่มี label คงที่ (โชว์เป็นช่องเดียวในตารางกรอกเร็ว)
  const ADV_LABEL = 'เบิกล่วงหน้า';
  const quickAdvance = (empId) => {
    const it = (drafts[empId]?.items || []).find((i) => i.kind === 'advance' && i.label === ADV_LABEL);
    return it ? it.amount : '';
  };
  const setQuickAdvance = (empId, value) => {
    const items = (drafts[empId]?.items || []).filter((i) => !(i.kind === 'advance' && i.label === ADV_LABEL));
    if (value !== '' && Number(value)) items.push({ kind: 'advance', label: ADV_LABEL, amount: value });
    updItems(empId, items);
  };

  // init drafts เมื่อข้อมูลเปลี่ยน
  useEffect(() => {
    const d = {};
    bizEmployees.forEach((emp) => {
      const p = payrollByEmp[emp.id];
      const its = p ? (itemsByPayroll[p.id] || []) : [];
      d[emp.id] = buildPayrollDraft(emp, p, its, year, month, businessId);
      if (!p && commissionMap && commissionMap[emp.id]) d[emp.id].commission = commissionMap[emp.id];
      if (!p && roomRentMap && roomRentMap[emp.id] != null) d[emp.id].roomFee = roomRentMap[emp.id];
    });
    setDrafts(d);
    setTouched(new Set());
  }, [bizEmployees, payrollByEmp, itemsByPayroll, commissionMap, roomRentMap]);

  const upd = (empId, field, value) => {
    setDrafts((prev) => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }));
    setTouched((prev) => new Set(prev).add(empId));
  };
  const updItems = (empId, items) => {
    setDrafts((prev) => ({ ...prev, [empId]: { ...prev[empId], items } }));
    setTouched((prev) => new Set(prev).add(empId));
  };

  // navigation: Enter/ลูกศร เลื่อนแนวตั้ง
  const onKeyNav = (e, col, rowIdx) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      document.querySelector(`[data-cell="${col}-${rowIdx + 1}"]`)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      document.querySelector(`[data-cell="${col}-${rowIdx - 1}"]`)?.focus();
    }
  };

  const eligible = bizEmployees.filter((e) => Number(e.baseSalary) > 0);
  const noSalaryCount = bizEmployees.length - eligible.length;

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const empId of touched) {
        const emp = bizEmployees.find((e) => e.id === empId);
        const draft = drafts[empId];
        if (!emp || !draft || !Number(draft.baseSalary)) continue;
        const payload = {
          employeeId: empId, businessId, periodYear: year, periodMonth: month,
          baseSalary: Number(draft.baseSalary) || 0, dailyRate: (Number(draft.baseSalary) || 0) / 30,
          holidayQuota: Number(draft.holidayQuota) || 0,
          commission: Number(draft.commission) || 0,
          holidayWorkDays: Number(draft.holidayWorkDays) || 0,
          holidayDaysTaken: Number(draft.holidayDaysTaken) || 0,
          lateDeduction: Number(draft.lateDeduction) || 0,
          socialSecurity: Number(draft.socialSecurity) || 0,
          roomFee: Number(draft.roomFee) || 0,
          paidViaCompany: Number(draft.paidViaCompany) || 0,
          note: draft.note || null,
          status: draft.status || 'draft',
          updatedAt: new Date().toISOString(),
        };
        const saved = await ops.payroll.upsert(payload);
        if (!saved) continue;
        const oldItems = await ops.payrollItem.listByPayrolls([saved.id]);
        for (const it of oldItems) await ops.payrollItem.delete(it.id);
        for (const it of (draft.items || [])) {
          if (!it.label?.trim() && !Number(it.amount)) continue;
          await ops.payrollItem.add({ payrollId: saved.id, kind: it.kind, label: it.label?.trim() || '-', amount: Number(it.amount) || 0 });
        }
      }
      onSaved();
    } finally { setSaving(false); }
  };

  // input cell ในตาราง
  const Cell = ({ empId, field, col, rowIdx, locked, w = 'w-20' }) => (
    <input
      type="number" step="0.01" inputMode="decimal"
      data-cell={`${col}-${rowIdx}`}
      disabled={locked}
      value={drafts[empId]?.[field] ?? ''}
      onChange={(e) => upd(empId, field, e.target.value)}
      onKeyDown={(e) => onKeyNav(e, col, rowIdx)}
      onFocus={(e) => e.target.select()}
      className={`${w} px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-stone-100 disabled:text-stone-400`}
    />
  );

  const itemCount = (empId) => (drafts[empId]?.items || []).filter((i) => i.label?.trim() || Number(i.amount)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm text-stone-500">
          {touched.size > 0 ? <span className="text-amber-700 font-medium">● แก้ไข {touched.size} คน ยังไม่บันทึก</span> : 'พิมพ์ตัวเลขในช่อง → กด Enter ลงคนถัดไป'}
          {noSalaryCount > 0 && <span className="ml-2 text-amber-600">({noSalaryCount} คนยังไม่ตั้งเงินเดือน)</span>}
        </div>
        <button onClick={saveAll} disabled={saving || touched.size === 0} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
          <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : `บันทึกทั้งหมด${touched.size > 0 ? ` (${touched.size})` : ''}`}
        </button>
      </div>

      {isMobile ? (
        /* ===== มือถือ: การ์ด ===== */
        <div className="space-y-3">
          {eligible.map((emp) => {
            const d = drafts[emp.id]; if (!d) return null;
            const locked = d.status === 'finalized';
            const calc = computePayroll(d, d.items);
            const dirty = touched.has(emp.id);
            const F = ({ label, field, hint }) => (
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-sm text-stone-600">{label}{hint && <span className="block text-[11px] text-stone-400">{hint}</span>}</span>
                <input type="number" step="0.01" inputMode="decimal" disabled={locked} value={d[field] ?? ''} onChange={(e) => upd(emp.id, field, e.target.value)} onFocus={(e) => e.target.select()} className="w-28 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
              </div>
            );
            return (
              <div key={emp.id} className={`bg-white rounded-xl border-2 p-4 ${dirty ? 'border-amber-300 bg-amber-50/20' : locked ? 'border-emerald-300' : 'border-stone-200'}`}>
                <div className="flex items-center gap-3 mb-2">
                  <Avatar photo={emp.photo} name={dispName(emp)} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-stone-800 truncate"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                    <div className="text-xs text-stone-500">ฐาน {fmtMoney(d.baseSalary)} ฿ • {fmtMoney(calc.daily)}/วัน</div>
                  </div>
                  {locked && <span className="text-[10px] text-emerald-700 font-medium">ปิดงวดแล้ว</span>}
                </div>
                {F({ label: 'คอมมิชชั่น', field: 'commission' })}
                {F({ label: 'ทำงานวันหยุด (วัน)', field: 'holidayWorkDays', hint: calc.holidayWorkPay > 0 ? `+${fmtMoney(calc.holidayWorkPay)}` : null })}
                {F({ label: 'วันหยุดที่ใช้', field: 'holidayDaysTaken', hint: `โควต้า ${d.holidayQuota}${calc.excessDays > 0 ? ` • เกิน ${calc.excessDays}` : ''}` })}
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-sm text-stone-600">เบิกล่วงหน้า</span>
                  <input type="number" step="0.01" inputMode="decimal" disabled={locked} value={quickAdvance(emp.id)} onChange={(e) => setQuickAdvance(emp.id, e.target.value)} onFocus={(e) => e.target.select()} className="w-28 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:bg-stone-100" />
                </div>
                {F({ label: 'ค่าห้องพัก', field: 'roomFee' })}
                {F({ label: 'รับผ่านบัญชีแล้ว', field: 'paidViaCompany' })}
                <button onClick={() => setItemsEmp(emp)} disabled={locked} className="w-full mt-2 px-3 py-2 border border-stone-200 rounded-lg text-sm text-stone-600 hover:bg-stone-50 flex items-center justify-center gap-1.5 disabled:opacity-50">
                  <Plus className="w-3.5 h-3.5" />งานเสริม/เบิก/หักอื่นๆ {itemCount(emp.id) > 0 && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded text-xs">{itemCount(emp.id)}</span>}
                </button>
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-stone-100">
                  <button onClick={() => onOpenDetail(emp)} className="text-xs text-stone-500 underline">ดูละเอียด/ปิดงวด</button>
                  <div className="text-right"><span className="text-xs text-stone-400 mr-2">สุทธิ</span><span className="font-bold text-emerald-700">{fmtMoney(calc.net)} ฿</span></div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ===== Desktop: ตาราง grid ===== */
        <div className="bg-white rounded-xl border border-stone-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200 text-xs text-stone-500">
              <tr>
                <th className="text-left px-3 py-2.5 sticky left-0 bg-stone-50 z-10 min-w-[160px]">ชื่อ</th>
                <th className="text-right px-2 py-2.5">ฐาน</th>
                <th className="text-right px-2 py-2.5">คอม</th>
                <th className="text-center px-2 py-2.5">ทำหยุด</th>
                <th className="text-center px-2 py-2.5">หยุด</th>
                <th className="text-right px-2 py-2.5">เบิก</th>
                <th className="text-right px-2 py-2.5">ค่าห้อง</th>
                <th className="text-right px-2 py-2.5">รับแล้ว</th>
                <th className="text-center px-2 py-2.5">รายการ</th>
                <th className="text-right px-3 py-2.5 sticky right-0 bg-stone-50 z-10">สุทธิ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {eligible.map((emp, rowIdx) => {
                const d = drafts[emp.id]; if (!d) return null;
                const locked = d.status === 'finalized';
                const calc = computePayroll(d, d.items);
                const dirty = touched.has(emp.id);
                const ic = itemCount(emp.id);
                return (
                  <tr key={emp.id} className={dirty ? 'bg-amber-50/40' : locked ? 'bg-emerald-50/30' : 'hover:bg-stone-50'}>
                    <td className={`px-3 py-2 sticky left-0 z-10 ${dirty ? 'bg-amber-50' : locked ? 'bg-emerald-50/60' : 'bg-white'}`}>
                      <button onClick={() => onOpenDetail(emp)} className="text-left">
                        <div className="font-medium text-stone-800 truncate max-w-[150px] hover:text-emerald-700"><span className="font-mono text-xs text-stone-400 mr-1">#{emp.employeeNumber}</span>{dispName(emp)}</div>
                        {locked && <span className="text-[10px] text-emerald-700">ปิดงวดแล้ว</span>}
                      </button>
                    </td>
                    <td className="px-2 py-2 text-right text-stone-500 whitespace-nowrap">{fmtMoney(d.baseSalary)}</td>
                    <td className="px-2 py-2">{Cell({ empId: emp.id, field: 'commission', col: 'commission', rowIdx, locked })}</td>
                    <td className="px-2 py-2 text-center">{Cell({ empId: emp.id, field: 'holidayWorkDays', col: 'holidayWorkDays', rowIdx, locked, w: 'w-14' })}</td>
                    <td className="px-2 py-2 text-center">{Cell({ empId: emp.id, field: 'holidayDaysTaken', col: 'holidayDaysTaken', rowIdx, locked, w: 'w-14' })}</td>
                    <td className="px-2 py-2"><input type="number" step="0.01" inputMode="decimal" data-cell={`advance-${rowIdx}`} disabled={locked} value={quickAdvance(emp.id)} onChange={(e) => setQuickAdvance(emp.id, e.target.value)} onKeyDown={(e) => onKeyNav(e, 'advance', rowIdx)} onFocus={(e) => e.target.select()} className="w-20 px-2 py-1.5 text-sm text-right border border-stone-200 rounded focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 disabled:bg-stone-100 disabled:text-stone-400" /></td>
                    <td className="px-2 py-2">{Cell({ empId: emp.id, field: 'roomFee', col: 'roomFee', rowIdx, locked })}</td>
                    <td className="px-2 py-2">{Cell({ empId: emp.id, field: 'paidViaCompany', col: 'paidViaCompany', rowIdx, locked })}</td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => setItemsEmp(emp)} disabled={locked} className="inline-flex items-center gap-1 px-2 py-1.5 border border-stone-200 rounded hover:bg-stone-50 text-stone-600 disabled:opacity-50">
                        <Plus className="w-3.5 h-3.5" />{ic > 0 ? <span className="px-1 bg-emerald-100 text-emerald-700 rounded text-xs">{ic}</span> : <span className="text-xs">เพิ่ม</span>}
                      </button>
                    </td>
                    <td className={`px-3 py-2 text-right font-semibold text-emerald-700 whitespace-nowrap sticky right-0 z-10 ${dirty ? 'bg-amber-50' : locked ? 'bg-emerald-50/60' : 'bg-white'}`}>{fmtMoney(calc.net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {itemsEmp && drafts[itemsEmp.id] && (
        <PayrollItemsModal
          employee={itemsEmp}
          draft={drafts[itemsEmp.id]}
          pastBonusLabels={pastBonus}
          onApply={(items) => { updItems(itemsEmp.id, items); setItemsEmp(null); }}
          onClose={() => setItemsEmp(null)}
        />
      )}
    </div>
  );
}

// ============ POPUP: งานเสริม/เบิก/หักอื่นๆ (สำหรับโหมดกรอกเร็ว) ============
function PayrollItemsModal({ employee, draft, pastBonusLabels, onApply, onClose }) {
  const [bonusTasks, setBonusTasks] = useState(draft.items.filter((i) => i.kind === 'bonus_task').map((i) => ({ label: i.label, amount: i.amount })));
  const [advances, setAdvances] = useState(draft.items.filter((i) => i.kind === 'advance').map((i) => ({ label: i.label, amount: i.amount })));
  const [others, setOthers] = useState(draft.items.filter((i) => i.kind === 'other_deduction').map((i) => ({ label: i.label, amount: i.amount })));
  const addBonus = (label) => setBonusTasks((prev) => prev.some((b) => b.label === label) ? prev : [...prev, { label, amount: '' }]);

  const apply = () => {
    onApply([
      ...bonusTasks.map((i) => ({ ...i, kind: 'bonus_task' })),
      ...advances.map((i) => ({ ...i, kind: 'advance' })),
      ...others.map((i) => ({ ...i, kind: 'other_deduction' })),
    ]);
  };

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="px-5 py-3 border-b border-stone-200 flex items-center justify-between">
          <div className="font-semibold text-stone-800 text-sm">{dispName(employee)} — งานเสริม/เบิก/หัก</div>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-auto space-y-4">
          <div className="bg-emerald-50/50 rounded-xl p-3">
            {pastBonusLabels && pastBonusLabels.length > 0 && (
              <div className="mb-2">
                <div className="text-[11px] text-stone-500 mb-1">เลือกงานที่เคยทำ:</div>
                <div className="flex flex-wrap gap-1.5">
                  {pastBonusLabels.map((lbl) => {
                    const used = bonusTasks.some((b) => b.label === lbl);
                    return (
                      <button key={lbl} type="button" onClick={() => addBonus(lbl)} disabled={used} className={`px-2 py-1 text-xs rounded-full border ${used ? 'bg-emerald-100 border-emerald-300 text-emerald-700 opacity-60' : 'bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50'}`}>
                        {used ? '✓ ' : '+ '}{lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <EditorItemList title="งานเสริม (ล้างห้องน้ำ, ลอกท่อ ฯลฯ)" list={bonusTasks} setList={setBonusTasks} color="text-emerald-700" addLabel="เพิ่มเอง" />
          </div>
          <div className="bg-red-50/40 rounded-xl p-3 space-y-3">
            <EditorItemList title="เบิกล่วงหน้า" list={advances} setList={setAdvances} color="text-red-600" addLabel="เพิ่ม" />
            <EditorItemList title="หักอื่นๆ" list={others} setList={setOthers} color="text-red-600" addLabel="เพิ่ม" />
          </div>
        </div>
        <div className="px-5 py-3 border-t border-stone-200 bg-stone-50 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
          <button onClick={apply} className="px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium">ใช้รายการนี้</button>
        </div>
      </div>
    </div>
  );
}

// ============ USERS PAGE ============
function UsersPage({ profiles, businesses, zones, ops, currentUserId }) {
  const [editing, setEditing] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const save = async (d) => {
    await ops.profile.update(editing.id, d);
    setShowModal(false); setEditing(null);
  };
  const del = async (id) => {
    if (id === currentUserId) return alert('ลบบัญชีตัวเองไม่ได้');
    if (!confirm('ลบผู้ใช้นี้? (พวกเขาจะไม่สามารถเข้าระบบได้)')) return;
    await ops.profile.delete(id);
  };

  const roleConfig = {
    owner: { label: 'เจ้าของระบบ', cls: 'bg-amber-100 text-amber-800', icon: Crown },
    business_manager: { label: 'หัวหน้าธุรกิจ', cls: 'bg-rose-100 text-rose-800', icon: Building2 },
    zone_manager: { label: 'หัวหน้าโซน', cls: 'bg-emerald-100 text-emerald-800', icon: User },
    viewer: { label: 'ผู้ดู', cls: 'bg-sky-100 text-sky-800', icon: Eye },
    pending: { label: 'รออนุมัติ', cls: 'bg-stone-100 text-stone-600', icon: Clock },
  };

  const describeScope = (u) => {
    const bizIds = u.businessIds || [];
    const zoneIds = u.zoneIds || [];
    if (u.role === 'owner') return 'ทุกธุรกิจ';
    if (u.role === 'pending') return '—';
    if (u.role === 'viewer' && bizIds.length === 0 && zoneIds.length === 0) return 'ทั้งระบบ (ดูได้หมด)';
    const bizNames = bizIds.map((id) => businesses.find((b) => b.id === id)?.name).filter(Boolean);
    const zoneNames = zoneIds.map((id) => {
      const z = zones.find((zn) => zn.id === id);
      if (!z) return null;
      const biz = businesses.find((b) => b.id === z.businessId);
      return biz ? `${biz.name} → ${z.name}` : z.name;
    }).filter(Boolean);
    const parts = [];
    if (bizNames.length) parts.push(`ธุรกิจ: ${bizNames.join(', ')}`);
    if (zoneNames.length) parts.push(`โซน: ${zoneNames.join(', ')}`);
    return parts.length ? parts.join(' • ') : '—';
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ผู้ใช้ระบบ" subtitle="จัดการสิทธิ์การเข้าถึง — ผู้ใช้ใหม่สมัครเองที่หน้า login แล้วเจ้าของอนุมัติที่นี่" />
      <div className="p-4 md:p-8">
        <div className="space-y-3">
          {profiles.map((u) => {
            const cfg = roleConfig[u.role] || roleConfig.pending;
            const Icon = cfg.icon;
            const isPending = u.role === 'pending';
            const isSelf = u.id === currentUserId;
            return (
              <div key={u.id} className={`bg-white rounded-xl border-2 ${isPending ? 'border-amber-300 bg-amber-50/30' : 'border-stone-200'} p-4 hover:shadow-sm transition-all`}>
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${u.role === 'owner' ? 'bg-amber-100' : isPending ? 'bg-amber-100' : 'bg-stone-100'}`}>
                    <Icon className={`w-5 h-5 ${u.role === 'owner' ? 'text-amber-600' : isPending ? 'text-amber-600' : 'text-stone-500'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-medium text-stone-800">{u.name || '—'}</span>
                      {isSelf && <span className="text-xs text-stone-400">(คุณ)</span>}
                      <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <div className="text-sm text-stone-600">{describeScope(u)}</div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 justify-end">
                  {isPending && (
                    <button onClick={() => { setEditing(u); setShowModal(true); }} className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm">
                      <CheckCircle2 className="w-4 h-4" /> อนุมัติ / กำหนดสิทธิ์
                    </button>
                  )}
                  {!isPending && (
                    <button onClick={() => { setEditing(u); setShowModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-stone-100 rounded-lg text-sm text-stone-700 border border-stone-200">
                      <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                    </button>
                  )}
                  {!isSelf && (
                    <button onClick={() => del(u.id)} className="flex items-center gap-1.5 px-3 py-1.5 hover:bg-red-50 rounded-lg text-sm text-red-600 border border-red-200">
                      <Trash2 className="w-3.5 h-3.5" /> ลบ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {showModal && (
        <Modal title="แก้ไขผู้ใช้" onClose={() => { setShowModal(false); setEditing(null); }} wide>
          <ProfileEditForm initial={editing} businesses={businesses} zones={zones} onSave={save} onCancel={() => { setShowModal(false); setEditing(null); }} isSelf={editing?.id === currentUserId} />
        </Modal>
      )}
    </div>
  );
}

function ProfileEditForm({ initial, businesses, zones, onSave, onCancel, isSelf }) {
  const [name, setName] = useState(initial?.name || '');
  const [role, setRole] = useState(initial?.role || 'pending');
  const [businessIds, setBusinessIds] = useState(initial?.businessIds || []);
  const [zoneIds, setZoneIds] = useState(initial?.zoneIds || []);
  const [canManagePayroll, setCanManagePayroll] = useState(!!initial?.canManagePayroll);
  // สำหรับ viewer: เลือก scope แบบใด
  const [viewerScope, setViewerScope] = useState(() => {
    if (initial?.role !== 'viewer') return 'system';
    if ((initial?.businessIds || []).length > 0) return 'business';
    if ((initial?.zoneIds || []).length > 0) return 'zone';
    return 'system';
  });

  const toggleBiz = (id) => setBusinessIds(businessIds.includes(id) ? businessIds.filter((x) => x !== id) : [...businessIds, id]);
  const toggleZone = (id) => setZoneIds(zoneIds.includes(id) ? zoneIds.filter((x) => x !== id) : [...zoneIds, id]);

  const submit = () => {
    if (role === 'business_manager' && businessIds.length === 0) return alert('กรุณาเลือกธุรกิจอย่างน้อย 1 ที่');
    if (role === 'zone_manager' && zoneIds.length === 0) return alert('กรุณาเลือกโซนอย่างน้อย 1 ที่');
    if (role === 'viewer' && viewerScope === 'business' && businessIds.length === 0) return alert('กรุณาเลือกธุรกิจ');
    if (role === 'viewer' && viewerScope === 'zone' && zoneIds.length === 0) return alert('กรุณาเลือกโซน');
    let bizIds = [], zIds = [];
    if (role === 'business_manager') bizIds = businessIds;
    else if (role === 'zone_manager') zIds = zoneIds;
    else if (role === 'viewer') {
      if (viewerScope === 'business') bizIds = businessIds;
      else if (viewerScope === 'zone') zIds = zoneIds;
    }
    onSave({ name: name.trim(), role, businessIds: bizIds, zoneIds: zIds, canManagePayroll: role === 'business_manager' ? canManagePayroll : false });
  };

  const ROLES = [
    { id: 'owner', label: 'เจ้าของระบบ', desc: 'ทุกอย่าง', icon: Crown, color: 'amber' },
    { id: 'business_manager', label: 'หัวหน้าธุรกิจ', desc: 'จัดการ 1+ ธุรกิจ', icon: Building2, color: 'rose' },
    { id: 'zone_manager', label: 'หัวหน้าโซน', desc: 'จัดการ 1+ โซน', icon: User, color: 'emerald' },
    { id: 'viewer', label: 'ผู้ดู', desc: 'ดูอย่างเดียว', icon: Eye, color: 'sky' },
    { id: 'pending', label: 'รออนุมัติ', desc: 'ยังไม่มีสิทธิ์', icon: Clock, color: 'stone' },
  ];

  return (
    <div className="space-y-4">
      <FormField label="ชื่อ-นามสกุล"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>

      <FormField label="บทบาท">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {ROLES.map((r) => {
            const Icon = r.icon;
            const sel = role === r.id;
            const disabled = isSelf && r.id !== 'owner';
            return (
              <button key={r.id} type="button" onClick={() => !disabled && setRole(r.id)} disabled={disabled} className={`p-3 rounded-lg border-2 text-center text-xs transition-all ${sel ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                <Icon className={`w-5 h-5 mx-auto mb-1 ${sel ? `text-${r.color}-600` : 'text-stone-400'}`} />
                <div className="font-medium text-stone-800">{r.label}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{r.desc}</div>
              </button>
            );
          })}
        </div>
        {isSelf && <p className="text-xs text-amber-700 mt-2">⚠️ เปลี่ยน role ของตัวเองไม่ได้ (กันการล็อกตัวเองออก)</p>}
      </FormField>

      {/* Business Manager: multi-select businesses */}
      {role === 'business_manager' && (
        <FormField label="ธุรกิจที่ดูแล" required>
          <p className="text-xs text-stone-500 -mt-1 mb-2">ติ๊กธุรกิจที่ผู้ใช้คนนี้จะจัดการได้ (โซน, ตำแหน่ง, พนักงานในธุรกิจนี้)</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-72 overflow-auto p-1">
            {businesses.map((b) => {
              const checked = businessIds.includes(b.id);
              return (
                <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleBiz(b.id)} className="w-4 h-4 rounded text-emerald-700" />
                  <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                  <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                </label>
              );
            })}
          </div>
        </FormField>
      )}

      {role === 'business_manager' && (
        <FormField label="สิทธิ์เงินเดือน">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => setCanManagePayroll(false)} className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${!canManagePayroll ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
              <EyeOff className={`w-4 h-4 mt-0.5 flex-shrink-0 ${!canManagePayroll ? 'text-emerald-700' : 'text-stone-400'}`} />
              <div>
                <div className={`text-sm font-medium ${!canManagePayroll ? 'text-emerald-900' : 'text-stone-700'}`}>ไม่เห็นเงินเดือน</div>
                <div className="text-[11px] text-stone-500 mt-0.5">ซ่อนข้อมูลเงินเดือนทั้งหมด (ค่าเริ่มต้น)</div>
              </div>
            </button>
            <button type="button" onClick={() => setCanManagePayroll(true)} className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${canManagePayroll ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
              <Wallet className={`w-4 h-4 mt-0.5 flex-shrink-0 ${canManagePayroll ? 'text-emerald-700' : 'text-stone-400'}`} />
              <div>
                <div className={`text-sm font-medium ${canManagePayroll ? 'text-emerald-900' : 'text-stone-700'}`}>เห็น + แก้ไขเงินเดือนได้</div>
                <div className="text-[11px] text-stone-500 mt-0.5">ทำเงินเดือน, ปรับเงินเดือน เฉพาะธุรกิจที่ดูแล</div>
              </div>
            </button>
          </div>
        </FormField>
      )}

      {role === 'zone_manager' && (
        <FormField label="โซนที่ดูแล" required>
          <p className="text-xs text-stone-500 -mt-1 mb-2">ติ๊กโซนที่ผู้ใช้คนนี้จะจัดการพนักงานได้ (เลือกได้หลายโซน, ข้ามธุรกิจได้)</p>
          <div className="space-y-3 max-h-72 overflow-auto p-1">
            {businesses.map((b) => {
              const bizZones = zones.filter((z) => z.businessId === b.id);
              if (bizZones.length === 0) return null;
              return (
                <div key={b.id}>
                  <div className="text-xs font-medium text-stone-600 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3 h-3" />{b.name}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {bizZones.map((z) => {
                      const checked = zoneIds.includes(z.id);
                      return (
                        <label key={z.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                          <input type="checkbox" checked={checked} onChange={() => toggleZone(z.id)} className="w-4 h-4 rounded text-emerald-700" />
                          <MapPin className={`w-3.5 h-3.5 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                          <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{z.name}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </FormField>
      )}

      {/* Viewer: choose scope */}
      {role === 'viewer' && (
        <>
          <FormField label="ขอบเขตการดู">
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setViewerScope('system')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'system' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">ทั้งระบบ</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เห็นทุกธุรกิจ</div>
              </button>
              <button type="button" onClick={() => setViewerScope('business')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'business' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">เฉพาะธุรกิจ</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เลือก 1+ ธุรกิจ</div>
              </button>
              <button type="button" onClick={() => setViewerScope('zone')} className={`p-3 rounded-lg border-2 text-center text-xs ${viewerScope === 'zone' ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200'}`}>
                <div className="font-medium text-stone-800">เฉพาะโซน</div>
                <div className="text-[10px] text-stone-500 mt-0.5">เลือก 1+ โซน</div>
              </button>
            </div>
          </FormField>
          {viewerScope === 'business' && (
            <FormField label="ธุรกิจที่ดูได้" required>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-auto p-1">
                {businesses.map((b) => {
                  const checked = businessIds.includes(b.id);
                  return (
                    <label key={b.id} className={`flex items-center gap-2 p-2.5 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleBiz(b.id)} className="w-4 h-4 rounded text-emerald-700" />
                      <Building2 className={`w-4 h-4 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                      <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{b.name}</span>
                    </label>
                  );
                })}
              </div>
            </FormField>
          )}
          {viewerScope === 'zone' && (
            <FormField label="โซนที่ดูได้" required>
              <div className="space-y-3 max-h-64 overflow-auto p-1">
                {businesses.map((b) => {
                  const bizZones = zones.filter((z) => z.businessId === b.id);
                  if (bizZones.length === 0) return null;
                  return (
                    <div key={b.id}>
                      <div className="text-xs font-medium text-stone-600 mb-1.5 flex items-center gap-1.5"><Building2 className="w-3 h-3" />{b.name}</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {bizZones.map((z) => {
                          const checked = zoneIds.includes(z.id);
                          return (
                            <label key={z.id} className={`flex items-center gap-2 p-2 rounded-lg border-2 cursor-pointer ${checked ? 'border-emerald-600 bg-emerald-50' : 'border-stone-200 hover:border-stone-300'}`}>
                              <input type="checkbox" checked={checked} onChange={() => toggleZone(z.id)} className="w-4 h-4 rounded text-emerald-700" />
                              <MapPin className={`w-3.5 h-3.5 ${checked ? 'text-emerald-700' : 'text-stone-400'}`} />
                              <span className={`text-sm ${checked ? 'font-medium text-emerald-900' : 'text-stone-700'}`}>{z.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </FormField>
          )}
        </>
      )}

      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ CONTRACTORS PAGE ============
function ContractorsPage({ contractors, visits, businesses, ops }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openContractor, setOpenContractor] = useState(null);
  const [search, setSearch] = useState('');

  const enriched = useMemo(() => contractors.map((c) => {
    const my = visits.filter((v) => v.contractorId === c.id);
    return { ...c, visitCount: my.length, lastVisit: my.map((v) => v.visitDate).sort().slice(-1)[0] || null, totalCost: my.reduce((s, v) => s + (Number(v.cost) || 0), 0) };
  }), [contractors, visits]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return enriched;
    return enriched.filter((c) => `${c.name} ${(Array.isArray(c.specialty) ? c.specialty.join(' ') : (c.specialty || ''))} ${c.phone || ''}`.toLowerCase().includes(q));
  }, [enriched, search]);

  const saveContractor = async (data) => {
    if (editing?.id) await ops.contractor.update(editing.id, data);
    else await ops.contractor.add(data);
    setShowForm(false); setEditing(null);
  };
  const delContractor = async (c) => {
    if (!window.confirm(`ลบ "${c.name}" และประวัติทั้งหมด (${c.visitCount} ครั้ง)?\nไฟล์แนบทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`)) return;
    await ops.contractor.del(c.id);
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ช่าง/ผู้รับเหมา" subtitle={`${contractors.length} คน • ${visits.length} ครั้งที่เคยมาทำงาน`}>
        <button onClick={() => { setEditing({}); setShowForm(true); }} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />เพิ่มช่าง</button>
      </PageHeader>
      <div className="p-4 md:p-8">
        <div className="mb-4 relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ชื่อ/ประเภทช่าง/เบอร์" className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
        </div>
        {filtered.length === 0 ? (
          <EmptyState icon={Wrench} title={search ? 'ไม่พบรายการ' : 'ยังไม่มีช่าง'} description={search ? 'ลองเปลี่ยนคำค้น' : 'เพิ่มช่าง/ผู้รับเหมาที่เคยติดต่อทำงาน เช่น ช่างแอร์ ช่างประตูม้วน ช่างกระจก'} action={!search ? <button onClick={() => { setEditing({}); setShowForm(true); }} className="px-4 py-2 bg-emerald-900 text-white rounded-lg text-sm font-medium">เพิ่มช่างคนแรก</button> : null} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((c) => (
              <div key={c.id} className="bg-white border border-stone-200 rounded-xl p-4 hover:border-stone-300 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar photo={c.photo} name={c.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-stone-800 truncate">{c.name}</div>
                      {Array.isArray(c.specialty) && c.specialty.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {c.specialty.map((s) => <span key={s} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] rounded">{s}</span>)}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => { setEditing(c); setShowForm(true); }} className="p-1.5 hover:bg-stone-100 rounded text-stone-500" title="แก้ไข"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => delContractor(c)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="ลบ"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                {c.phone && <div className="flex items-center gap-1.5 text-xs text-stone-500 mt-1"><Phone className="w-3 h-3" />{c.phone}</div>}
                <div className="mt-3 pt-3 border-t border-stone-100 grid grid-cols-3 gap-2 text-center">
                  <div><div className="text-[10px] text-stone-400 uppercase">มา</div><div className="font-semibold text-stone-800 text-sm">{c.visitCount} ครั้ง</div></div>
                  <div><div className="text-[10px] text-stone-400 uppercase">รวมจ่าย</div><div className="font-semibold text-stone-800 text-sm">{fmtMoney(c.totalCost)}</div></div>
                  <div><div className="text-[10px] text-stone-400 uppercase">ล่าสุด</div><div className="font-semibold text-stone-800 text-sm">{c.lastVisit ? fmt(c.lastVisit) : '—'}</div></div>
                </div>
                <button onClick={() => setOpenContractor(c)} className="mt-3 w-full px-3 py-2 bg-stone-50 hover:bg-stone-100 text-stone-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5"><FileText className="w-3.5 h-3.5" />ดู/เพิ่มประวัติการมา</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {showForm && (
        <Modal title={editing?.id ? 'แก้ไขข้อมูลช่าง' : 'เพิ่มช่างใหม่'} onClose={() => { setShowForm(false); setEditing(null); }}>
          <ContractorForm initial={editing} onSave={saveContractor} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </Modal>
      )}
      {openContractor && (
        <ContractorDetailModal contractor={openContractor} allVisits={visits} businesses={businesses} ops={ops} onClose={() => setOpenContractor(null)} />
      )}
    </div>
  );
}

function ContractorForm({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [specialties, setSpecialties] = useState(Array.isArray(initial?.specialty) ? initial.specialty : (initial?.specialty ? [initial.specialty] : []));
  const [customSpec, setCustomSpec] = useState('');
  const [phone, setPhone] = useState(initial?.phone || '');
  const [address, setAddress] = useState(initial?.address || '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [photo, setPhoto] = useState(initial?.photo || '');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const presets = ['ช่างแอร์', 'ช่างประตูม้วน', 'ช่างกระจก', 'ช่างไฟฟ้า', 'ช่างประปา', 'ช่างซ่อมทั่วไป', 'ทำความสะอาด', 'ขนย้าย'];
  const toggleSpec = (s) => setSpecialties((arr) => arr.includes(s) ? arr.filter((x) => x !== s) : [...arr, s]);
  const addCustom = () => { const s = customSpec.trim(); if (s && !specialties.includes(s)) setSpecialties((arr) => [...arr, s]); setCustomSpec(''); };
  const handlePhoto = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    try { setPhoto(await resizeImage(f, 400)); } finally { setUploading(false); }
  };
  const submit = () => {
    if (!name.trim()) return alert('กรุณากรอกชื่อช่าง/ร้าน');
    onSave({ name: name.trim(), specialty: specialties, phone: phone.trim() || null, address: address.trim() || null, notes: notes.trim() || null, photo: photo || null });
  };
  return (
    <div className="space-y-4">
      <FormField label="รูปช่าง">
        <div className="flex items-center gap-4">
          <Avatar photo={photo} name={name || '?'} size={72} />
          <div className="flex flex-col gap-2">
            <input ref={fileRef} type="file" accept="image/*" onChange={handlePhoto} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50">
              <Camera className="w-4 h-4" />{uploading ? 'กำลังอัปโหลด...' : (photo ? 'เปลี่ยนรูป' : 'อัปโหลดรูป')}
            </button>
            {photo && <button type="button" onClick={() => setPhoto('')} className="text-xs text-red-600 hover:underline text-left">ลบรูป</button>}
          </div>
        </div>
      </FormField>
      <FormField label="ชื่อช่าง/ร้าน" required><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="เช่น นายสมชาย / ร้านแอร์เย็นเย็น" /></FormField>
      <FormField label="ประเภท/ความเชี่ยวชาญ (เลือกได้หลายอย่าง)">
        {specialties.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {specialties.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 text-white text-xs font-medium rounded-full">
                {s}<button type="button" onClick={() => toggleSpec(s)} className="hover:bg-emerald-700 rounded-full"><X className="w-3 h-3" /></button>
              </span>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {presets.filter((p) => !specialties.includes(p)).map((p) => (
            <button key={p} type="button" onClick={() => toggleSpec(p)} className="px-2.5 py-1 text-xs rounded bg-stone-100 hover:bg-emerald-100 text-stone-700">+ {p}</button>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={customSpec} onChange={(e) => setCustomSpec(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }} className="flex-1 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="พิมพ์ประเภทอื่นแล้วกด เพิ่ม" />
          <button type="button" onClick={addCustom} className="px-3 py-2 bg-stone-200 hover:bg-stone-300 text-stone-700 rounded-lg text-sm font-medium">เพิ่ม</button>
        </div>
      </FormField>
      <FormField label="เบอร์โทร"><input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0xx-xxx-xxxx" /></FormField>
      <FormField label="ที่อยู่/ที่ตั้ง"><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      <FormField label="หมายเหตุ"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="เช่น ค่าแรงมาตรฐาน, ข้อจำกัด, เวลาว่าง" /></FormField>
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

function ContractorDetailModal({ contractor, allVisits, businesses, ops, onClose }) {
  const myVisits = useMemo(() =>
    allVisits.filter((v) => v.contractorId === contractor.id)
      .sort((a, b) => String(b.visitDate || '').localeCompare(String(a.visitDate || ''))),
    [allVisits, contractor.id]);
  const [editingVisit, setEditingVisit] = useState(null);
  const [showVisitForm, setShowVisitForm] = useState(false);

  const saveVisit = async (data) => {
    const payload = { ...data, contractorId: contractor.id };
    if (editingVisit?.id) await ops.contractorVisit.update(editingVisit.id, payload);
    else await ops.contractorVisit.add(payload);
    setShowVisitForm(false); setEditingVisit(null);
  };
  const delVisit = async (v) => {
    if (!window.confirm(`ลบประวัติวันที่ ${fmt(v.visitDate)}?\nไฟล์แนบทั้งหมดจะถูกลบและไม่สามารถกู้คืนได้`)) return;
    await ops.contractorVisit.del(v.id);
  };
  const totalCost = myVisits.reduce((s, v) => s + (Number(v.cost) || 0), 0);

  return (
    <Modal title={`ประวัติ — ${contractor.name}`} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex items-center gap-3 pb-3 border-b border-stone-100">
          <Avatar photo={contractor.photo} name={contractor.name} size={52} />
          <div className="min-w-0">
            <div className="font-semibold text-stone-800">{contractor.name}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(Array.isArray(contractor.specialty) ? contractor.specialty : []).map((s) => <span key={s} className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[11px] rounded">{s}</span>)}
              {contractor.phone && <span className="inline-flex items-center gap-1 text-xs text-stone-500"><Phone className="w-3 h-3" />{contractor.phone}</span>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-stone-50 rounded-lg p-3 text-center"><div className="text-xs text-stone-500">จำนวนครั้ง</div><div className="font-semibold text-stone-800 text-lg">{myVisits.length}</div></div>
          <div className="bg-stone-50 rounded-lg p-3 text-center"><div className="text-xs text-stone-500">รวมจ่าย</div><div className="font-semibold text-stone-800 text-lg">{fmtMoney(totalCost)}</div></div>
          <div className="bg-stone-50 rounded-lg p-3 text-center"><div className="text-xs text-stone-500">มาล่าสุด</div><div className="font-semibold text-stone-800 text-lg">{myVisits[0]?.visitDate ? fmt(myVisits[0].visitDate) : '—'}</div></div>
        </div>
        <div className="flex justify-end">
          <button onClick={() => { setEditingVisit({}); setShowVisitForm(true); }} className="flex items-center gap-2 px-3 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Plus className="w-4 h-4" />บันทึกการมาทำงาน</button>
        </div>
        {myVisits.length === 0 ? (
          <EmptyState icon={Calendar} title="ยังไม่มีประวัติ" description="กดปุ่ม 'บันทึกการมาทำงาน' เพื่อบันทึกครั้งแรก" />
        ) : (
          <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-1">
            {myVisits.map((v) => {
              const biz = businesses.find((b) => b.id === v.businessId);
              return (
                <div key={v.id} className="bg-white border border-stone-200 rounded-lg p-3 hover:border-stone-300">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-800 text-xs font-medium rounded"><Calendar className="w-3 h-3" />{fmt(v.visitDate)}</span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 text-sky-800 text-xs font-medium rounded"><Building2 className="w-3 h-3" />{biz?.name || '— ไม่พบตึก —'}</span>
                        {Number(v.cost) > 0 && <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 text-xs font-medium rounded">{fmtMoney(v.cost)} ฿</span>}
                      </div>
                      <div className="text-sm text-stone-700 whitespace-pre-line">{v.workDescription}</div>
                      {v.notes && <div className="text-xs text-stone-500 mt-1 italic whitespace-pre-line">หมายเหตุ: {v.notes}</div>}
                      {v.docs?.length > 0 && <div className="mt-2"><DocList paths={v.docs} /></div>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => { setEditingVisit(v); setShowVisitForm(true); }} className="p-1.5 hover:bg-stone-100 rounded text-stone-500" title="แก้ไข"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => delVisit(v)} className="p-1.5 hover:bg-red-50 rounded text-red-500" title="ลบ"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {showVisitForm && (
        <Modal title={editingVisit?.id ? 'แก้ไขประวัติการมาทำงาน' : 'บันทึกการมาทำงาน'} onClose={() => { setShowVisitForm(false); setEditingVisit(null); }}>
          <VisitForm initial={editingVisit} businesses={businesses} onSave={saveVisit} onCancel={() => { setShowVisitForm(false); setEditingVisit(null); }} />
        </Modal>
      )}
    </Modal>
  );
}

function VisitForm({ initial, businesses, onSave, onCancel }) {
  const [businessId, setBusinessId] = useState(initial?.businessId || businesses[0]?.id || '');
  const [visitDate, setVisitDate] = useState(initial?.visitDate || new Date().toISOString().slice(0, 10));
  const [workDescription, setWorkDescription] = useState(initial?.workDescription || '');
  const [cost, setCost] = useState(initial?.cost ?? '');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [docs, setDocs] = useState(initial?.docs || []);
  const submit = () => {
    if (!businessId) return alert('กรุณาเลือกตึก/ธุรกิจ');
    if (!visitDate) return alert('กรุณาระบุวันที่');
    if (!workDescription.trim()) return alert('กรุณากรอกรายละเอียดงาน');
    onSave({ businessId, visitDate, workDescription: workDescription.trim(), cost: Number(cost) || 0, notes: notes.trim() || null, docs });
  };
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FormField label="ตึก/ธุรกิจ" required>
          <select value={businessId} onChange={(e) => setBusinessId(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600">
            <option value="">— เลือกตึก —</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </FormField>
        <FormField label="วันที่มา" required><input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" /></FormField>
      </div>
      <FormField label="รายละเอียดงาน" required><textarea autoFocus value={workDescription} onChange={(e) => setWorkDescription(e.target.value)} rows={3} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" placeholder="เช่น ล้างแอร์ห้อง 101, เปลี่ยนคอมเพรสเซอร์ห้อง 203" /></FormField>
      <FormField label="ค่าใช้จ่าย (บาท)"><input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600" placeholder="0" /></FormField>
      <FormField label="หมายเหตุ"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 resize-none" /></FormField>
      {businessId ? (
        <MultiDocUpload label="บิล/ใบเสร็จ/รูปงาน" paths={docs} businessId={businessId} docType="contractor" onChange={setDocs} />
      ) : (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">เลือกตึก/ธุรกิจก่อน จึงจะอัปโหลดเอกสารได้</p>
      )}
      <FormActions onCancel={onCancel} onSubmit={submit} />
    </div>
  );
}

// ============ SETTINGS PAGE ============
function SettingsPage({ expiryWarnMonths, birthdayNotify, birthdayWarnDays, ops, onSaved, onSavedBirthday }) {
  const [months, setMonths] = useState(expiryWarnMonths ?? 2);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  useEffect(() => { setMonths(expiryWarnMonths ?? 2); }, [expiryWarnMonths]);

  // วันเกิด
  const [bdayOn, setBdayOn] = useState(birthdayNotify ?? true);
  const [bdayDays, setBdayDays] = useState(birthdayWarnDays ?? 7);
  const [savingB, setSavingB] = useState(false);
  const [savedBAt, setSavedBAt] = useState(0);
  useEffect(() => { setBdayOn(birthdayNotify ?? true); setBdayDays(birthdayWarnDays ?? 7); }, [birthdayNotify, birthdayWarnDays]);

  const clamp = (n) => Math.min(12, Math.max(1, Math.round(Number(n) || 1)));
  const dirty = clamp(months) !== (expiryWarnMonths ?? 2);
  const clampD = (n) => Math.min(60, Math.max(0, Math.round(Number(n) || 0)));
  const dirtyB = bdayOn !== (birthdayNotify ?? true) || clampD(bdayDays) !== (birthdayWarnDays ?? 7);

  const save = async () => {
    const m = clamp(months);
    setSaving(true);
    const ok = await ops.settings.update({ expiryWarnMonths: m });
    setSaving(false);
    if (ok) { setMonths(m); onSaved?.(m); setSavedAt(Date.now()); }
  };
  const saveBirthday = async () => {
    const d = clampD(bdayDays);
    setSavingB(true);
    const ok = await ops.settings.update({ birthdayNotifyEnabled: bdayOn, birthdayWarnDays: d });
    setSavingB(false);
    if (ok) { setBdayDays(d); onSavedBirthday?.(bdayOn, d); setSavedBAt(Date.now()); }
  };

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ตั้งค่า" subtitle="ตั้งค่าที่มีผลกับทั้งระบบ" />
      <div className="p-8 max-w-2xl space-y-5">
        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center"><BellRing className="w-5 h-5 text-red-600" /></div>
            <h3 className="font-semibold text-stone-800">แจ้งเตือนเอกสารใกล้หมดอายุ</h3>
          </div>
          <p className="text-sm text-stone-500 mb-5">เตือนล่วงหน้าก่อนเอกสารหมดอายุ — มีผลกับบัตรแรงงาน, พาสปอร์ต และบัตรประจำตัว ของพนักงานทุกคนทั้งระบบ</p>

          <FormField label="เตือนก่อนหมดอายุ (เดือน)">
            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 6].map((m) => (
                <button key={m} type="button" onClick={() => setMonths(m)} className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${clamp(months) === m ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{m} เดือน</button>
              ))}
              <div className="flex items-center gap-2 ml-1">
                <span className="text-sm text-stone-400">หรือกำหนดเอง</span>
                <input type="number" min={1} max={12} value={months} onChange={(e) => setMonths(e.target.value)} className="w-20 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-center" />
                <span className="text-sm text-stone-500">เดือน</span>
              </div>
            </div>
          </FormField>

          <p className="text-xs text-stone-500 mt-3">ระบบจะแจ้งเตือนเมื่อเอกสารเหลืออายุไม่เกิน {clamp(months)} เดือน หรือหมดอายุไปแล้ว (ตั้งได้ 1–12 เดือน)</p>

          <div className="flex items-center gap-3 mt-6">
            <button onClick={save} disabled={saving || !dirty} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
              <Save className="w-4 h-4" />{saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            {savedAt > 0 && !dirty && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว</span>}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-stone-200 p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-pink-100 flex items-center justify-center"><Calendar className="w-5 h-5 text-pink-600" /></div>
              <h3 className="font-semibold text-stone-800">แจ้งเตือนวันเกิดพนักงาน</h3>
            </div>
            <button type="button" onClick={() => setBdayOn((v) => !v)} className={`relative w-12 h-7 rounded-full transition-colors ${bdayOn ? 'bg-emerald-600' : 'bg-stone-300'}`} aria-label="เปิด/ปิดแจ้งเตือนวันเกิด">
              <span className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow transition-transform ${bdayOn ? 'translate-x-5' : ''}`} />
            </button>
          </div>
          <p className="text-sm text-stone-500 mb-5">แจ้งเตือนวันเกิดของพนักงานทุกคนทั้งระบบ — แยกจากการเตือนเอกสารหมดอายุ</p>

          <div className={bdayOn ? '' : 'opacity-40 pointer-events-none'}>
            <FormField label="เตือนล่วงหน้า (วัน)">
              <div className="flex flex-wrap items-center gap-2">
                {[0, 1, 3, 7].map((d) => (
                  <button key={d} type="button" onClick={() => setBdayDays(d)} className={`px-4 py-2 rounded-lg border-2 text-sm font-medium transition-all ${clampD(bdayDays) === d ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-200 text-stone-600 hover:border-stone-300'}`}>{d === 0 ? 'เฉพาะวันเกิด' : `${d} วัน`}</button>
                ))}
                <div className="flex items-center gap-2 ml-1">
                  <span className="text-sm text-stone-400">หรือกำหนดเอง</span>
                  <input type="number" min={0} max={60} value={bdayDays} onChange={(e) => setBdayDays(e.target.value)} className="w-20 px-3 py-2 border border-stone-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 text-center" />
                  <span className="text-sm text-stone-500">วัน</span>
                </div>
              </div>
            </FormField>
            <p className="text-xs text-stone-500 mt-3">{clampD(bdayDays) === 0 ? 'แจ้งเตือนเฉพาะวันเกิดเท่านั้น' : `แจ้งเตือนล่วงหน้า ${clampD(bdayDays)} วันก่อนวันเกิด`} (ตั้งได้ 0–60 วัน)</p>
          </div>

          <div className="flex items-center gap-3 mt-6">
            <button onClick={saveBirthday} disabled={savingB || !dirtyB} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 disabled:bg-stone-200 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium">
              <Save className="w-4 h-4" />{savingB ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
            {savedBAt > 0 && !dirtyB && <span className="inline-flex items-center gap-1.5 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" />บันทึกแล้ว</span>}
          </div>
        </div>

        <p className="text-xs text-stone-400">หมายเหตุ: การแจ้งเตือนจะอัปเดตเมื่อเจ้าของระบบเปิดแอป (ระบบ generate ฝั่งเจ้าของ) — ค่าที่ตั้งมีผลกับทั้งระบบทันทีหลังบันทึก</p>
      </div>
    </div>
  );
}

// ============ REUSABLE UI ============
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] flex flex-col`}>
        <div className="px-6 py-4 border-b border-stone-200 flex items-center justify-between">
          <h2 className="font-semibold text-stone-800">{title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded text-stone-500"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 overflow-auto">{children}</div>
      </div>
    </div>
  );
}

function FormField({ label, required, children }) {
  return <div><label className="block text-sm font-medium text-stone-700 mb-1.5">{label}{required && <span className="text-red-500"> *</span>}</label>{children}</div>;
}

function FormActions({ onCancel, onSubmit }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button onClick={onCancel} className="px-4 py-2 text-stone-700 hover:bg-stone-100 rounded-lg text-sm font-medium">ยกเลิก</button>
      <button onClick={onSubmit} className="flex items-center gap-2 px-4 py-2 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"><Save className="w-4 h-4" /> บันทึก</button>
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-16">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4"><Icon className="w-8 h-8 text-stone-400" /></div>
      <h3 className="text-lg font-semibold text-stone-700">{title}</h3>
      {description && <p className="text-sm text-stone-500 mt-1 mb-5 max-w-md mx-auto">{description}</p>}
      {action}
    </div>
  );
}
