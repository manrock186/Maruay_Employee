import React, { useState, useEffect, useMemo } from 'react';
import { Search, Clock } from 'lucide-react';
import { MONTH_NAMES } from '../lib/payroll.js';
import { EmptyState, PageHeader } from '../ui/index.jsx';

// ============ AUDIT LOG (ประวัติการแก้ไข — เจ้าของดูได้) ============
const AUDIT_TABLE_LABELS = {
  businesses: 'ธุรกิจ', zones: 'โซน', positions: 'ตำแหน่ง', employees: 'พนักงาน',
  payrolls: 'เงินเดือน', commission_pools: 'คอมมิชชั่น', room_rent_pools: 'ค่าห้องพนักงาน',
  recurring_task_pools: 'งานเสริมประจำ', advance_pools: 'เบิกเงิน', contractors: 'ช่าง/ผู้รับเหมา',
  contractor_visits: 'ประวัติการมาทำงาน', expense_requests: 'ตั้งเบิก', salary_changes: 'ปรับเงินเดือน',
  user_profiles: 'ผู้ใช้ระบบ',
};
const AUDIT_ACTION = {
  INSERT: { label: 'เพิ่ม', cls: 'bg-emerald-100 text-emerald-800' },
  UPDATE: { label: 'แก้ไข', cls: 'bg-amber-100 text-amber-800' },
  DELETE: { label: 'ลบ', cls: 'bg-rose-100 text-rose-700' },
};
const AUDIT_ROLE = { owner: 'เจ้าของ', business_manager: 'หัวหน้าธุรกิจ', zone_manager: 'หัวหน้าโซน', viewer: 'ผู้ดู', pending: 'รออนุมัติ' };

function AuditLogPage({ businesses, ops }) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all'); // all | INSERT | UPDATE | DELETE
  const [tableFilter, setTableFilter] = useState('all');

  const load = async () => {
    setLoading(true);
    const rows = await ops.audit.list({ limit: 400 });
    setEntries(rows); setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const bizName = (id) => businesses.find((b) => b.id === id)?.name || '';
  const fmtDT = (s) => { try { return new Date(s).toLocaleString('th-TH', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return s; } };
  const describe = (e) => {
    const d = e.data || {};
    if (e.label) return e.label;
    if (d.period_year && d.period_month) return `งวด ${MONTH_NAMES[(d.period_month || 1) - 1]} ${(d.period_year || 0) + 543}`;
    if (d.business_id && bizName(d.business_id)) return bizName(d.business_id);
    return e.row_id ? `#${String(e.row_id).slice(0, 8)}` : '';
  };

  const tablesPresent = useMemo(() => [...new Set(entries.map((e) => e.tableName))], [entries]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (actionFilter !== 'all' && e.action !== actionFilter) return false;
      if (tableFilter !== 'all' && e.tableName !== tableFilter) return false;
      if (!q) return true;
      return `${e.actorName || ''} ${e.label || ''} ${AUDIT_TABLE_LABELS[e.tableName] || e.tableName} ${describe(e)}`.toLowerCase().includes(q);
    });
  }, [entries, search, actionFilter, tableFilter]);

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="ประวัติการแก้ไข" subtitle="บันทึกว่าใครเพิ่ม/แก้ไข/ลบข้อมูลอะไร เมื่อไหร่ (เฉพาะเจ้าของเห็น)">
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 border border-stone-300 rounded-lg text-sm text-stone-700 hover:bg-stone-50"><Clock className="w-4 h-4" />รีเฟรช</button>
      </PageHeader>
      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหา ชื่อผู้ทำ / รายการ" className="w-full pl-9 pr-3 py-2 border border-stone-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40" />
          </div>
          <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="px-3 py-2 border border-stone-300 rounded-lg bg-white text-sm">
            <option value="all">ทุกหัวข้อ</option>
            {tablesPresent.map((t) => <option key={t} value={t}>{AUDIT_TABLE_LABELS[t] || t}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5">
          {['all', 'INSERT', 'UPDATE', 'DELETE'].map((a) => (
            <button key={a} onClick={() => setActionFilter(a)} className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${actionFilter === a ? 'bg-emerald-900 text-white border-emerald-900' : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}>
              {a === 'all' ? 'ทั้งหมด' : AUDIT_ACTION[a].label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center text-stone-400 py-12 text-sm">กำลังโหลด...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Clock} title="ยังไม่มีประวัติ" description="เมื่อมีการเพิ่ม/แก้ไข/ลบข้อมูล จะถูกบันทึกไว้ที่นี่" />
        ) : (
          <div className="space-y-1.5">
            {filtered.map((e) => {
              const act = AUDIT_ACTION[e.action] || { label: e.action, cls: 'bg-stone-100 text-stone-700' };
              return (
                <div key={e.id} className="flex items-start gap-3 bg-white border border-stone-200 rounded-lg px-3 py-2.5">
                  <span className={`px-2 py-0.5 text-[11px] font-medium rounded shrink-0 mt-0.5 ${act.cls}`}>{act.label}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-stone-800">
                      <span className="font-medium">{AUDIT_TABLE_LABELS[e.tableName] || e.tableName}</span>
                      {describe(e) && <span className="text-stone-500"> — {describe(e)}</span>}
                    </div>
                    <div className="text-[11px] text-stone-400 mt-0.5">
                      โดย {e.actorName || '— ไม่ทราบผู้ใช้ —'}{e.actorRole && AUDIT_ROLE[e.actorRole] ? ` (${AUDIT_ROLE[e.actorRole]})` : ''} • {fmtDT(e.createdAt)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="text-xs text-stone-400">แสดงรายการล่าสุดสูงสุด 400 รายการ • ครอบคลุม: ธุรกิจ โซน ตำแหน่ง พนักงาน เงินเดือน คอมมิชชั่น ค่าห้อง งานเสริมประจำ เบิกเงิน ช่าง ตั้งเบิก ปรับเงินเดือน และผู้ใช้ระบบ</p>
      </div>
    </div>
  );
}



export {
  AuditLogPage,
};
