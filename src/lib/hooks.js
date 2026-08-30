import { useState, useEffect, useRef } from 'react';

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

// ============ DRAG TO REORDER (กดค้างแล้วลาก) ============
// ทำเองด้วย Pointer Events ไม่ใช้ไลบรารี — HTML5 drag-and-drop ใช้บนมือถือไม่ได้
// มือถือ: แตะค้าง 350ms (ถ้าขยับก่อนครบ = ตั้งใจสกrolล → ยกเลิก) · เดสก์ท็อป: กดค้างหรือลากที่ไอคอนจุด
function useDragReorder(ids, onCommit, groupOf) {
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);
  const st = useRef({ timer: null, sx: 0, sy: 0, el: null, pid: null, id: null, dragging: false, over: null });

  // React ผูก touchmove ที่ root แบบ passive → preventDefault ใน onPointerMove ไม่พอ ต้องเป็น native passive:false
  // และต้องผูกตั้งแต่ pointerdown (ซึ่งยิงก่อน touchstart) — ถ้าไปผูกตอนลากจริง browser ตัดสินใจไปแล้วว่า
  // gesture นี้สกrolลได้ ทำให้ touchmove ที่ตามมา cancelable=false → preventDefault ไม่มีผล
  // ref เดียวตลอดอายุ hook: ถ้าสร้างใหม่ทุก render จะ removeEventListener ไม่ตรงตัว แล้วค้างถาวร
  const blockScrollRef = useRef((e) => { if (st.current.dragging) e.preventDefault(); });

  const reset = () => {
    const r = st.current;
    document.removeEventListener('touchmove', blockScrollRef.current);
    if (r.timer) { clearTimeout(r.timer); r.timer = null; }
    if (r.el && r.pid != null) { try { r.el.releasePointerCapture(r.pid); } catch { /* ปล่อยไม่ได้ก็ไม่เป็นไร */ } }
    document.body.style.userSelect = '';
    st.current = { timer: null, sx: 0, sy: 0, el: null, pid: null, id: null, dragging: false, over: null };
    setDragId(null); setOverId(null);
  };

  // ถ้า component ถูกถอดกลางกดค้าง (เช่น หมุนจอ → สลับ card/table) timer จะยิงต่อ
  // แล้วไม่มีใครเรียก reset → userSelect:none ค้างทั้งแอป
  useEffect(() => () => {
    const r = st.current;
    if (r.timer) clearTimeout(r.timer);
    document.removeEventListener('touchmove', blockScrollRef.current);
    document.body.style.userSelect = '';
  }, []);

  const onPointerDown = (e, id, immediate) => {
    if (e.button != null && e.button !== 0) return;
    if (st.current.timer || st.current.dragging) return; // สองนิ้วจับสองที่พร้อมกัน → ยึดอันแรกไว้
    const el = e.currentTarget;
    const r = st.current;
    r.sx = e.clientX; r.sy = e.clientY; r.el = el; r.pid = e.pointerId; r.id = id; r.dragging = false; r.over = id;
    // ผูกตั้งแต่ตอนนี้ (ก่อน touchstart) แต่ข้างในเช็ค st.current.dragging → ปัดนิ้วเลื่อนหน้าจอปกติไม่โดนบล็อก
    document.addEventListener('touchmove', blockScrollRef.current, { passive: false });
    const activate = () => {
      r.timer = null; r.dragging = true;
      document.body.style.userSelect = 'none';
      try { el.setPointerCapture(r.pid); } catch { /* บาง browser ไม่รองรับ */ }
      if (navigator.vibrate) { try { navigator.vibrate(15); } catch { /* ไม่รองรับก็ข้าม */ } }
      setDragId(id); setOverId(id);
    };
    if (immediate) activate();
    else r.timer = setTimeout(activate, 350);
  };

  const onPointerMove = (e) => {
    const r = st.current;
    if (!r.dragging) {
      // ขยับก่อนครบเวลา = ผู้ใช้ตั้งใจเลื่อนหน้าจอ ไม่ใช่ลาก
      if (r.timer && (Math.abs(e.clientX - r.sx) > 8 || Math.abs(e.clientY - r.sy) > 8)) { clearTimeout(r.timer); r.timer = null; r.id = null; }
      return;
    }
    e.preventDefault();
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-drag-id]');
    const id = hit?.getAttribute('data-drag-id');
    if (!id || !ids.includes(id) || id === r.over) return;
    // ย้ายข้ามกลุ่มไม่ได้ (โซนของพนักงานเปลี่ยนที่หน้าข้อมูลพนักงานเท่านั้น)
    if (groupOf && groupOf(id) !== groupOf(r.id)) return;
    r.over = id; setOverId(id);
  };

  const onPointerUp = () => {
    const r = st.current;
    const from = r.dragging ? r.id : null;
    const to = r.over;
    reset();
    if (!from || !to || from === to) return;
    const fi = ids.indexOf(from), ti = ids.indexOf(to);
    if (fi < 0 || ti < 0) return;
    if (groupOf && groupOf(from) !== groupOf(to)) return;
    const next = ids.filter((x) => x !== from);
    next.splice(ti > fi ? next.indexOf(to) + 1 : next.indexOf(to), 0, from);
    onCommit(next);
  };

  // ตัวจับ: immediate=true สำหรับไอคอนจุด (ลากได้ทันที), false = ต้องกดค้าง
  // ใส่ที่ "พื้นที่ที่ปลอดภัยจะกดค้าง" (เช่น ช่องชื่อ) ไม่ใช่ทั้งแถว เพราะแถวมีช่องกรอกเลข
  const bindHandle = (id, immediate = false) => ({
    onPointerDown: (e) => onPointerDown(e, id, immediate),
    onPointerMove,
    onPointerUp,
    onPointerCancel: reset,
    onContextMenu: (e) => { if (st.current.dragging) e.preventDefault(); },
    // ไอคอนจุด = เป้าเล็ก ปิด touch-action ได้เลย · พื้นที่กดค้าง (เช่น หัวการ์ด) ปล่อยให้สกrolลได้ตามปกติ
    // การบล็อกสกrolลตอนลากจริง ใช้ blockScrollRef (native touchmove) แทน ไม่งั้นแถบนี้จะเลื่อนหน้าจอไม่ได้เลย
    style: immediate ? { touchAction: 'none', cursor: 'grab' } : { cursor: 'grab' },
  });

  return { dragId, overId, bindHandle, dragging: !!dragId };
}

// สไตล์ขณะลาก — div/การ์ดใช้ ring ได้ แต่ <tr> ใช้ไม่ได้ (box-shadow บน table row เพี้ยนหลาย browser)
// จึงแยก: แถวใช้ opacity, ตัวชี้จุดวางไปอยู่ที่ช่องแรกเป็นแถบสีด้านซ้าย
const dragClass = (id, dragId, overId) =>
  dragId === id ? 'opacity-40' : (dragId && overId === id ? 'ring-2 ring-emerald-400 ring-inset' : '');
const rowDragClass = (id, dragId) => (dragId === id ? 'opacity-40' : '');
const cellDropClass = (id, dragId, overId) => (dragId && dragId !== id && overId === id ? 'shadow-[inset_3px_0_0_0_#059669]' : '');

export {
  useIsMobile,
  useDragReorder,
  dragClass,
  rowDragClass,
  cellDropClass,
};
