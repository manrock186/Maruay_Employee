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

export {
  dispName,
  NATIONALITIES,
  natLabel,
  natFlag,
  isForeign,
  RESIGN_REASONS,
  resignLabel,
  isActive,
  SALARY_REASONS,
  salaryReasonLabel,
  todayStr,
  THEMES,
  applyTheme,
};
