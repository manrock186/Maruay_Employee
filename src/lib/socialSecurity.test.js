import { describe, it, expect } from 'vitest';
import {
  roundBaht, rateFor, calcSso, ssoWage, registrationFor, ssoForPayroll, ssoTodos, remitDeadline, toCsv, maskNationalId, isHospitalChangeSeason,
} from './socialSecurity.js';

// เรทเดียวกับที่ seed ใน DB
const RATES = [
  { effectiveFrom: '1995-01-01', rateEmployee: 5, rateEmployer: 5, wageMin: 1650, wageMax: 15000 },
  { effectiveFrom: '2026-01-01', rateEmployee: 5, rateEmployer: 5, wageMin: 1650, wageMax: 17500 },
  { effectiveFrom: '2029-01-01', rateEmployee: 5, rateEmployer: 5, wageMin: 1650, wageMax: 20000 },
  { effectiveFrom: '2032-01-01', rateEmployee: 5, rateEmployer: 5, wageMin: 1650, wageMax: 23000 },
];
const at = (y, m, wage) => calcSso(wage, rateFor(RATES, y, m));

describe('calcSso — ตรงกับ SQL sso_contribution (ทดสอบบน prod 31 ต.ค. 2569)', () => {
  it('22,000 งวด ต.ค. 2569 → 875/875 ฐาน 17,500', () => {
    expect(at(2026, 10, 22000)).toMatchObject({ wageBase: 17500, employee: 875, employer: 875 });
  });
  it('14,490 → 725 (ปัด .50 ขึ้น · เดิมระบบหัก 724.50)', () => {
    expect(at(2026, 10, 14490).employee).toBe(725);
  });
  it('14,000 → 700', () => expect(at(2026, 10, 14000).employee).toBe(700));
  it('17,500 พอดี → 875', () => expect(at(2026, 10, 17500).employee).toBe(875));
  it('22,000 งวด ธ.ค. 2568 → 750 (เพดานเดิม)', () => expect(at(2025, 12, 22000).employee).toBe(750));
  it('22,000 งวด ก.พ. 2572 → 1,000 (ระยะที่ 2)', () => expect(at(2029, 2, 22000).employee).toBe(1000));
  it('30,000 งวด 2575 → 1,150 (ระยะที่ 3)', () => expect(at(2032, 1, 30000).employee).toBe(1150));
  it('1,000 → ฐานขั้นต่ำ 1,650 → 83', () => expect(at(2026, 10, 1000)).toMatchObject({ wageBase: 1650, employee: 83 }));
  it('ไม่มีเรท → null (ห้าม fallback 750)', () => {
    expect(calcSso(22000, rateFor([], 2026, 10))).toBeNull();
    expect(rateFor(RATES, 1990, 1)).toBeNull();
  });
});

describe('roundBaht', () => {
  it('.5 ปัดขึ้น · .49 ปัดลง', () => {
    expect(roundBaht(724.5)).toBe(725);
    expect(roundBaht(724.49)).toBe(724);
    expect(roundBaht(82.5)).toBe(83);
  });
});

describe('ssoWage — ค่าคอม', () => {
  const p = { baseSalary: 14490, commission: 2366.85 };
  it('สวิตช์ปิด → ไม่นับค่าคอม', () => expect(ssoWage(p, false)).toBe(14490));
  it('สวิตช์เปิด → นับค่าคอม (017 ต.ค. → 843)', () => {
    expect(ssoWage(p, true)).toBeCloseTo(16856.85);
    expect(at(2026, 10, ssoWage(p, true)).employee).toBe(843);
  });
});

describe('registrationFor', () => {
  const regs = [
    { id: 'a', employeeId: 'e1', businessId: 'b1', status: 'active' },
    { id: 'b', employeeId: 'e2', businessId: 'b1', status: 'ended', endedDate: '2026-10-15' },
    { id: 'c', employeeId: 'e3', businessId: 'b1', status: 'pending' },
  ];
  it('active / pending ครอบ', () => {
    expect(registrationFor(regs, 'e1', 'b1', 2026, 10)?.id).toBe('a');
    expect(registrationFor(regs, 'e3', 'b1', 2026, 10)?.id).toBe('c');
  });
  it('ended กลางเดือน → ยังหักเดือนนั้น · เดือนถัดไปไม่หัก', () => {
    expect(registrationFor(regs, 'e2', 'b1', 2026, 10)?.id).toBe('b');
    expect(registrationFor(regs, 'e2', 'b1', 2026, 11)).toBeNull();
  });
  it('ธุรกิจอื่น → ไม่ครอบ (บัญชีนายจ้างแยกตามธุรกิจ)', () => {
    expect(registrationFor(regs, 'e1', 'b2', 2026, 10)).toBeNull();
  });
});

describe('ssoForPayroll', () => {
  const regs = [{ id: 'a', employeeId: 'e1', businessId: 'b1', status: 'active' }];
  const base = { rates: RATES, regs, employeeId: 'e1', businessId: 'b1', year: 2026, month: 10 };
  it('ไม่มีทะเบียน → null', () => {
    expect(ssoForPayroll({ ...base, employeeId: 'x', payroll: { baseSalary: 20000 } })).toBeNull();
  });
  it('ธุรกิจปิดสวิตช์ค่าคอม → คิดจากเงินเดือน', () => {
    expect(ssoForPayroll({ ...base, business: { ssoIncludeCommission: false }, payroll: { baseSalary: 14000, commission: 5000 } }).employee).toBe(700);
  });
  it('ธุรกิจเปิดสวิตช์ค่าคอม → รวมค่าคอม', () => {
    expect(ssoForPayroll({ ...base, business: { ssoIncludeCommission: true }, payroll: { baseSalary: 14000, commission: 5000 } }).employee).toBe(875);
  });
});

describe('ssoTodos', () => {
  const employees = [
    { id: 'e1', startDate: '2026-09-01', status: 'active' },
    { id: 'e2', startDate: '2026-10-20', status: 'active' },
    { id: 'e3', startDate: '2020-01-01', status: 'resigned' },
    { id: 'e4', startDate: '2020-01-01', status: 'resigned' },
    { id: 'e5', startDate: '2020-01-01', status: 'active' },
  ];
  const regs = [
    { id: 'r1', employeeId: 'e1', businessId: 'b', status: 'pending' },
    { id: 'r2', employeeId: 'e2', businessId: 'b', status: 'pending' },
    { id: 'r3', employeeId: 'e3', businessId: 'b', status: 'active', registeredDate: '2020-01-05', hospitalId: 'h' },
    { id: 'r4', employeeId: 'e4', businessId: 'b', status: 'ended', endedDate: '2026-10-10' },
    { id: 'r5', employeeId: 'e5', businessId: 'b', status: 'active', registeredDate: null, hospitalId: null },
  ];
  const kinds = (docs = []) => ssoTodos({ regs, employees, docs, today: '2026-10-31' }).map((t) => `${t.regId}:${t.kind}`);
  it('ครบทุกประเภท', () => {
    expect(kinds()).toEqual(['r1:register_overdue', 'r3:resigned_still_active', 'r4:resign_notice', 'r5:incomplete']);
  });
  it('มีเอกสาร สปส.6-09 แล้ว → ไม่เตือน', () => {
    expect(kinds([{ employeeSsoId: 'r4', kind: 'sso_6_09' }])).not.toContain('r4:resign_notice');
  });
});

describe('อื่นๆ', () => {
  it('กำหนดส่ง: งวด ต.ค. 69 (จ่าย พ.ย.) → 15 ธ.ค. · งวด ธ.ค. → 15 ก.พ. ปีถัดไป', () => {
    expect(remitDeadline(2026, 10)).toEqual({ year: 2026, month: 12, day: 15 });
    expect(remitDeadline(2026, 12)).toEqual({ year: 2027, month: 2, day: 15 });
  });
  it('ช่วงเปลี่ยน รพ. = ม.ค.–มี.ค.', () => {
    expect(isHospitalChangeSeason('2027-02-10')).toBe(true);
    expect(isHospitalChangeSeason('2026-10-31')).toBe(false);
  });
  it('CSV มี BOM + escape', () => {
    expect(toCsv([['ชื่อ', 'a,b'], ['x"y', 1]])).toBe('﻿ชื่อ,"a,b"\r\n"x""y",1');
  });
  it('ซ่อนเลขบัตร', () => {
    expect(maskNationalId('1234567890123')).toBe('1-2345-xxxxx-xx-3');
    expect(maskNationalId('')).toBe('');
  });
});
