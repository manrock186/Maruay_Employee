import React, { useState, useRef } from 'react';
import { Building2, MapPin, Plus, Edit2, Trash2, Upload, ChevronRight, ChevronDown, MapPinned, FileText } from 'lucide-react';
import { dispName } from '../lib/format.js';
import { resizeImage } from '../lib/storage.js';
import { Modal, FormField, FormActions, EmptyState, PageHeader } from '../ui/index.jsx';

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
      <div className="p-4 md:p-8">
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
                  <div className="p-4 sm:p-5 flex items-center gap-3 sm:gap-4 group hover:bg-stone-50">
                    <button onClick={() => toggle(biz.id)} className="p-1 hover:bg-stone-200 rounded flex-shrink-0">
                      {isCollapsed ? <ChevronRight className="w-5 h-5 text-stone-500" /> : <ChevronDown className="w-5 h-5 text-stone-500" />}
                    </button>
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {biz.logo ? <img src={biz.logo} alt={biz.name} className="w-full h-full object-contain" /> : <Building2 className="w-6 h-6 text-emerald-800" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-stone-800 text-base sm:text-lg truncate">{biz.name}</h3>
                      {biz.description && <p className="text-sm text-stone-500 line-clamp-1">{biz.description}</p>}
                      {/* สถิติแบบย่อใต้ชื่อ — เฉพาะมือถือ (กันชื่อถูกเบียด) */}
                      <div className="flex sm:hidden items-center gap-3 mt-0.5 text-xs text-stone-500">
                        <span><span className="font-medium text-stone-700">{bizZones.length}</span> โซน</span>
                        <span><span className="font-medium text-stone-700">{bizEmps.length}</span> พนักงาน</span>
                      </div>
                    </div>
                    {/* สถิติคอลัมน์ — เฉพาะจอใหญ่ */}
                    <div className="hidden sm:flex items-center gap-6 text-sm flex-shrink-0">
                      <div className="text-center"><div className="text-stone-400 text-xs">โซน</div><div className="font-medium text-stone-700">{bizZones.length}</div></div>
                      <div className="text-center"><div className="text-stone-400 text-xs">พนักงาน</div><div className="font-medium text-stone-700">{bizEmps.length}</div></div>
                    </div>
                    {/* ปุ่มจัดการ — มือถือโชว์เสมอ (แตะ hover ไม่ได้), จอใหญ่ค่อยโผล่ตอน hover */}
                    <div className="flex gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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


export {
  BusinessesPage,
};
