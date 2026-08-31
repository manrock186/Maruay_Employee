import { dispName } from './format.js';
import { MONTH_NAMES, payMonthLabel, fmtMoney, computePayroll } from './payroll.js';

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
    [`ค่าทำงานวันหยุด (${c.holidayWorkDays} วัน)`, c.holidayWorkPay],
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
function printPayrollRegister({ business, groups, year, month }) {
  const m = fmtMoney;
  const period = `${MONTH_NAMES[month - 1]} ${year + 543}`;
  const cols = ['ฐาน', 'คอมฯ', 'ค่าวันหยุด', 'โบนัส', 'รวมรับ', 'ปกส.', 'ขาด/สาย', 'ค่าหอ', 'เบิก', 'หักอื่น', 'ผ่านบริษัท', 'สุทธิ'];
  const COLSPAN = 4 + cols.length;
  const blank = () => ({ base: 0, com: 0, hol: 0, bonus: 0, inc: 0, ss: 0, lateAbsent: 0, room: 0, adv: 0, other: 0, viaco: 0, net: 0, count: 0 });
  const add = (t, p, c) => {
    t.base += Number(p.baseSalary) || 0; t.com += Number(p.commission) || 0; t.hol += c.holidayWorkPay; t.bonus += c.bonusTasks;
    t.inc += c.totalIncome; t.ss += Number(p.socialSecurity) || 0;
    t.lateAbsent += (Number(p.lateDeduction) || 0) + c.excessHolidayDeduction;
    t.room += Number(p.roomFee) || 0; t.adv += c.advances; t.other += c.otherDeductions;
    t.viaco += Number(p.paidViaCompany) || 0; t.net += c.net; t.count += 1;
  };
  const td = (v, extra = '') => `<td style="padding:5px 6px;border:1px solid #e7e5e4;text-align:right;${extra}">${m(v)}</td>`;
  const sumCell = (v, extra = '', pad = '7px') => `<td style="padding:${pad} 6px;border:1px solid #d6d3d1;text-align:right;font-weight:700;${extra}">${m(v)}</td>`;
  const totalCells = (t, pad) => `${sumCell(t.base, '', pad)}${sumCell(t.com, '', pad)}${sumCell(t.hol, '', pad)}${sumCell(t.bonus, '', pad)}` +
    `${sumCell(t.inc, 'color:#047857;', pad)}${sumCell(t.ss, '', pad)}${sumCell(t.lateAbsent, '', pad)}${sumCell(t.room, '', pad)}` +
    `${sumCell(t.adv, '', pad)}${sumCell(t.other, '', pad)}${sumCell(t.viaco, '', pad)}${sumCell(t.net, 'color:#065f46;', pad)}`;

  const grand = blank();
  let seq = 0;
  const body = (groups || []).map((g) => {
    const sub = blank();
    const rowsHtml = g.rows.map((r) => {
      seq += 1;
      const e = r.emp;
      const lead = `<td style="padding:5px 6px;border:1px solid #e7e5e4;">${seq}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;">#${esc(e.employeeNumber || '—')}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;white-space:nowrap;">${esc(dispName(e))}</td>
        <td style="padding:5px 6px;border:1px solid #e7e5e4;">${esc(r.position?.name || '—')}</td>`;
      if (!r.payroll) {
        return `<tr>${lead}<td colspan="${cols.length}" style="padding:5px 6px;border:1px solid #e7e5e4;text-align:center;color:#a8a29e;font-style:italic;">ยังไม่ได้ทำเงินเดือน</td></tr>`;
      }
      const p = r.payroll, c = r.calc;
      add(sub, p, c); add(grand, p, c);
      const lateAbsent = (Number(p.lateDeduction) || 0) + c.excessHolidayDeduction;
      return `<tr>${lead}
        ${td(p.baseSalary)}${td(p.commission)}${td(c.holidayWorkPay)}${td(c.bonusTasks)}
        ${td(c.totalIncome, 'font-weight:600;color:#047857;')}
        ${td(p.socialSecurity)}${td(lateAbsent)}${td(p.roomFee)}${td(c.advances)}${td(c.otherDeductions)}${td(p.paidViaCompany)}
        ${td(c.net, 'font-weight:700;color:#065f46;')}
      </tr>`;
    }).join('');

    const header = `<tr style="background:#ecfdf5;">
      <td colspan="${COLSPAN}" style="padding:6px;border:1px solid #d6d3d1;font-family:'Kanit';font-weight:600;color:#065f46;">
        ${esc(g.name)} <span style="font-weight:400;color:#57534e;">(${g.rows.length} คน)</span>
      </td></tr>`;
    // ยอดรวมรายแผนก — ข้ามถ้าทั้งแผนกยังไม่มีใครทำเงินเดือน (จะได้ไม่มีแถวศูนย์เปล่าๆ)
    const subtotal = sub.count === 0 ? '' : `<tr style="background:#fafaf9;">
      <td colspan="4" style="padding:5px 6px;border:1px solid #d6d3d1;font-weight:600;text-align:right;">รวม ${esc(g.name)} (${sub.count} คน)</td>
      ${totalCells(sub, '5px')}
    </tr>`;
    return header + rowsHtml + subtotal;
  }).join('');

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
        <th style="padding:7px 6px;border:1px solid #0a7553;">ชื่อ</th>
        <th style="padding:7px 6px;border:1px solid #0a7553;">ตำแหน่ง</th>
        ${cols.map((c) => `<th style="padding:7px 6px;border:1px solid #0a7553;text-align:right;">${c}</th>`).join('')}
      </tr></thead>
      <tbody>${body}
      <tr style="background:#f5f5f4;font-family:'Kanit';">
        <td colspan="4" style="padding:7px 6px;border:1px solid #d6d3d1;font-weight:700;">รวมทั้งสิ้น (${grand.count} คน)</td>
        ${totalCells(grand, '7px')}
      </tr>
      </tbody>
    </table>
    <div style="margin-top:14px;font-size:13px;text-align:right;">รวมจ่ายสุทธิทั้งสิ้น: <b style="font-family:'Kanit';font-size:16px;color:#065f46;">${m(grand.net)} บาท</b></div>
    <div style="font-size:12px;color:#57534e;text-align:right;">(${esc(bahtText(grand.net))})</div>
    <div style="display:flex;justify-content:flex-end;gap:60px;margin-top:36px;font-size:12.5px;">
      <div style="text-align:center;">ลงชื่อ ............................................. ผู้จัดทำ</div>
      <div style="text-align:center;">ลงชื่อ ............................................. ผู้อนุมัติ</div>
    </div>
  </div>`;
  openPrintHtml(`รายงานเงินเดือน ${business?.name || ''} ${period}`, inner, `@page{size:A4 landscape;margin:0;}`);
}

export {
  esc,
  bahtText,
  slipHeaderHtml,
  openPrintHtml,
  payslipInner,
  printPayslip,
  printPayslips,
  printPayrollRegister,
};
