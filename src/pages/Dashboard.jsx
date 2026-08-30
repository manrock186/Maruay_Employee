import React, { useMemo } from 'react';
import { Users, Building2, MapPin, ChevronRight, AlertCircle, Award } from 'lucide-react';
import { businessPositionId } from '../lib/business.js';
import { dispName, isActive } from '../lib/format.js';
import { PageHeader, Avatar } from '../ui/index.jsx';

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
      <div className="p-4 md:p-8">
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


export {
  Dashboard,
};
