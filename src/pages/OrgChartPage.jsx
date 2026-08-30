import React, { useMemo } from 'react';
import { Building2, Network } from 'lucide-react';
import { businessPositionId } from '../lib/business.js';
import { dispName, isActive } from '../lib/format.js';
import { EmptyState, PageHeader, Avatar } from '../ui/index.jsx';

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

  if ((isOwner || isBM || isViewer) && !activeBusinessId) return <div className="h-full overflow-auto"><PageHeader title="แผนผังองค์กร" /><div className="p-4 md:p-8"><EmptyState icon={Network} title="เลือกธุรกิจที่ sidebar" description="แผนผังองค์กรเป็นข้อมูลเฉพาะของแต่ละธุรกิจ — ต้องเลือกธุรกิจที่ sidebar ก่อน" /></div></div>;

  return (
    <div className="h-full overflow-auto">
      <PageHeader title="แผนผังองค์กร" subtitle="สายบังคับบัญชาตามที่กำหนด" />
      <div className="p-4 md:p-8">
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


export {
  OrgChartPage,
};
