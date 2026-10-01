import { daysInMonth } from './probation.js';

// ============ วันหยุด — รูปแบบวันหยุดของพนักงาน + วันหยุดนักขัตฤกษ์ ============
// พนักงานมี 2 รูปแบบ (employees.holiday_scheme)
//   fixed    = โควต้าคงที่/เดือน (holidayQuota) — คนส่วนใหญ่ เช่น 2 วัน/เดือน
//   calendar = หยุดตามวันในสัปดาห์ (holidayWeekdays: 0=อาทิตย์ … 6=เสาร์ ตาม Date.getDay())
//              + วันหยุดนักขัตฤกษ์ (holidayIncludePublic) → โควต้าแต่ละเดือนไม่เท่ากัน นับจากปฏิทิน
// ตาราง public_holidays เป็นรายการกลางทั้งระบบ (เจ้าของแก้ที่หน้าตั้งค่า)

const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']; // index = getDay()
const SHORT_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

// 'YYYY-MM-DD' → Date (เวลาท้องถิ่น) — ไม่ใช้ new Date(str) เพราะจะถูกตีความเป็น UTC แล้ววันเพี้ยนได้
function parseISODate(s) {
  if (!s) return null;
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

const isCalendarScheme = (emp) => emp?.holidayScheme === 'calendar';

// ช่วงวันที่พนักงาน "อยู่ในงวด" — เดือนเริ่มงานนับจากวันเริ่ม / เดือนลาออกนับถึงวันลาออก
function periodDayRange(emp, year, month) {
  const dim = daysInMonth(year, month);
  let from = 1, to = dim;
  const s = parseISODate(emp?.startDate);
  if (s && s.getFullYear() === Number(year) && s.getMonth() === Number(month) - 1) from = s.getDate();
  const r = parseISODate(emp?.resignedDate);
  if (r && r.getFullYear() === Number(year) && r.getMonth() === Number(month) - 1) to = Math.min(to, r.getDate());
  return { from, to, dim };
}

// นับโควต้าตามปฏิทินของงวด: วันหยุดประจำสัปดาห์ + นักขัตฤกษ์ที่ไม่ตรงกับวันหยุดประจำสัปดาห์อยู่แล้ว
function calendarHolidayBreakdown(emp, year, month, publicHolidays = []) {
  const weekdays = new Set((Array.isArray(emp?.holidayWeekdays) ? emp.holidayWeekdays : []).map(Number).filter((d) => d >= 0 && d <= 6));
  const { from, to } = periodDayRange(emp, year, month);
  let weekly = 0;
  for (let d = from; d <= to; d += 1) {
    if (weekdays.has(new Date(Number(year), Number(month) - 1, d).getDay())) weekly += 1;
  }
  const publicDays = [];
  if (emp?.holidayIncludePublic !== false) {
    (publicHolidays || []).forEach((h) => {
      const dt = parseISODate(h.holidayDate);
      if (!dt || dt.getFullYear() !== Number(year) || dt.getMonth() !== Number(month) - 1) return;
      const day = dt.getDate();
      if (day < from || day > to) return;
      if (weekdays.has(dt.getDay())) return; // ตรงกับวันหยุดประจำสัปดาห์แล้ว ไม่นับซ้ำ
      publicDays.push({ day, name: h.name });
    });
    publicDays.sort((a, b) => a.day - b.day);
  }
  return { weekly, publicDays, total: weekly + publicDays.length, weekdays: [...weekdays].sort(), from, to };
}

// โควต้าวันหยุดตั้งต้นของงวด — fixed ใช้ค่าในโปรไฟล์ / calendar นับจากปฏิทิน
function monthlyHolidayQuota(emp, year, month, publicHolidays) {
  if (isCalendarScheme(emp)) return calendarHolidayBreakdown(emp, year, month, publicHolidays).total;
  return Number(emp?.holidayQuota ?? 4) || 0;
}

// ป้ายวันในสัปดาห์แบบย่อ: [0,6] → "ส-อา" · [0] → "อา" · อื่นๆ → "จ, พ"
function weekdaysLabel(weekdays = []) {
  const ds = [...new Set((Array.isArray(weekdays) ? weekdays : []).map(Number))].sort();
  if (ds.length === 2 && ds[0] === 0 && ds[1] === 6) return 'ส-อา';
  return ds.map((d) => WEEKDAY_LABELS[d]).filter(Boolean).join(', ') || '—';
}

// คำอธิบายรูปแบบวันหยุดสั้นๆ: "ส-อา + นักขัตฤกษ์" / "2 วัน/เดือน"
function holidaySchemeLabel(emp) {
  if (!isCalendarScheme(emp)) return `${Number(emp?.holidayQuota ?? 4) || 0} วัน/เดือน`;
  return `${weekdaysLabel(emp.holidayWeekdays)}${emp.holidayIncludePublic !== false ? ' + นักขัตฤกษ์' : ''}`;
}

// ที่มาของโควต้างวดนี้ เช่น "ส-อา 9 + นักขัตฤกษ์ 2 (13 ต.ค., 23 ต.ค.) = 11" — ใช้เป็น hint ในหน้าเงินเดือน
function holidayQuotaHint(emp, year, month, publicHolidays) {
  if (!isCalendarScheme(emp)) return `ตามโปรไฟล์ ${Number(emp?.holidayQuota ?? 4) || 0} วัน/เดือน`;
  const b = calendarHolidayBreakdown(emp, year, month, publicHolidays);
  const parts = [`${weekdaysLabel(b.weekdays)} ${b.weekly}`];
  if (emp.holidayIncludePublic !== false) {
    const names = b.publicDays.map((p) => `${p.day} ${SHORT_MONTHS[Number(month) - 1]}`).join(', ');
    parts.push(`นักขัตฤกษ์ ${b.publicDays.length}${names ? ` (${names})` : ''}`);
  }
  const partial = b.from > 1 || b.to < b.dim ? ' · นับเฉพาะวันที่อยู่ในงวด' : '';
  return `${parts.join(' + ')} = ${b.total}${partial}`;
}

export {
  WEEKDAY_LABELS,
  parseISODate,
  isCalendarScheme,
  periodDayRange,
  calendarHolidayBreakdown,
  monthlyHolidayQuota,
  weekdaysLabel,
  holidaySchemeLabel,
  holidayQuotaHint,
};
