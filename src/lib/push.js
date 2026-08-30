import { supabase } from '../supabase.js';

// ============ PUSH NOTIFICATION HELPERS ============
// VAPID public key (คู่กับ private key ที่ตั้งเป็น secret ใน Supabase Edge Function) — เปิดเผยได้ ไม่ลับ
const VAPID_PUBLIC_KEY = 'BFslv9GRRMfwJb1kqYRPmNu0FfZU1C5g9od_mox0M5uZ8VcvxuvxO6zYuxcq2gnj1tn3Hd6o2sNaruqNLPnDixk';

// แปลง base64url → Uint8Array (ใช้กับ applicationServerKey)
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// อุปกรณ์/เบราว์เซอร์รองรับ push ไหม
const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

// subscription ปัจจุบันของเครื่องนี้ (ถ้ามี)
async function getPushSubscription() {
  if (!pushSupported()) return null;
  try { const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }
  catch { return null; }
}

// เปิด push: ขอสิทธิ์ → subscribe → บันทึก subscription ลง Supabase
async function enablePush(userId) {
  if (!pushSupported()) { alert('อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับการแจ้งเตือนแบบ push'); return false; }
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') { alert('ยังไม่ได้อนุญาตการแจ้งเตือน — กรุณาเปิดสิทธิ์การแจ้งเตือนของแอปนี้ในตั้งค่าเครื่อง แล้วลองใหม่'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
    const j = sub.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert({
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: j.keys?.p256dh,
      auth: j.keys?.auth,
      user_agent: (navigator.userAgent || '').slice(0, 300),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) { alert('บันทึกการแจ้งเตือนไม่สำเร็จ: ' + error.message); return false; }
    return true;
  } catch (e) {
    alert('เปิดการแจ้งเตือนไม่สำเร็จ: ' + (e?.message || e));
    return false;
  }
}

// ปิด push: ลบ subscription จาก Supabase + ยกเลิกที่เครื่อง
async function disablePush() {
  const sub = await getPushSubscription();
  if (sub) {
    try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); } catch {}
    try { await sub.unsubscribe(); } catch {}
  }
  return true;
}

export {
  VAPID_PUBLIC_KEY,
  urlBase64ToUint8Array,
  pushSupported,
  getPushSubscription,
  enablePush,
  disablePush,
};
