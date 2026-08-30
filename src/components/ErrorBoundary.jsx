import React from 'react';
import { AlertCircle } from 'lucide-react';

// กันจอขาว: React.lazy โยน error ตอน render ถ้าโหลด chunk ไม่สำเร็จ
// ถ้าไม่มี boundary React 18 จะ unmount ทั้ง root = จอขาว กู้ไม่ได้จนกว่าจะรีโหลดเอง
// เคสที่เจอบ่อยที่สุด: deploy เวอร์ชันใหม่ ไฟล์ chunk เก่าหายจาก CDN แต่ผู้ใช้ยังเปิดแอปค้างไว้
// (แอปนี้เป็น PWA + service worker แบบ network-only ผู้ใช้จึงเปิดค้างข้ามรอบ deploy ได้จริง)
const CHUNK_ERROR = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk \d+ failed/i;
const RELOAD_KEY = 'maruay:chunk-reloaded';

const safeSession = {
  get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } },
};

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, reloading: false }; }

  static getDerivedStateFromError(error) { return { error }; }

  componentDidCatch(error) {
    // chunk หาย = ไฟล์เก่าถูกแทนที่ตอน deploy → รีโหลดให้อัตโนมัติ
    // กัน loop ด้วยการจำ "เวลา" ที่รีโหลดล่าสุด ไม่ใช่แค่ธง boolean:
    // ถ้าใช้ธงแล้วเคลียร์ตอน mount สำเร็จ จะวนไม่รู้จบ (mount ผ่าน → เคลียร์ธง → กดหน้าเดิมที่ยังพัง → รีโหลดอีก)
    // ห่างไม่ถึง 1 นาที = รีโหลดไปแล้วแต่ยังพัง แปลว่าไม่ใช่เรื่อง cache → โชว์ปุ่มให้ผู้ใช้ตัดสินใจแทน
    if (!CHUNK_ERROR.test(error?.message || '')) return;
    const last = Number(safeSession.get(RELOAD_KEY) || 0);
    if (Date.now() - last > 60000) {
      safeSession.set(RELOAD_KEY, String(Date.now()));
      this.setState({ reloading: true });
      window.location.reload();
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.state.reloading) return null;
    const isChunk = CHUNK_ERROR.test(this.state.error?.message || '');
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
        <div className="max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-100 mb-4">
            <AlertCircle className="w-7 h-7 text-amber-700" />
          </div>
          <h1 className="text-lg font-semibold text-stone-800">
            {isChunk ? 'มีเวอร์ชันใหม่ของแอป' : 'เกิดข้อผิดพลาด'}
          </h1>
          <p className="text-sm text-stone-500 mt-2">
            {isChunk
              ? 'โหลดหน้านี้ไม่สำเร็จเพราะแอปถูกอัปเดตระหว่างที่เปิดค้างไว้ — กดโหลดใหม่เพื่อใช้เวอร์ชันล่าสุด'
              : 'ลองโหลดใหม่อีกครั้ง ถ้ายังไม่หายให้แจ้งผู้ดูแลระบบ'}
          </p>
          <button
            onClick={() => { safeSession.del(RELOAD_KEY); window.location.reload(); }}
            className="mt-5 px-5 py-2.5 bg-emerald-900 hover:bg-emerald-800 text-white rounded-lg text-sm font-medium"
          >
            โหลดใหม่
          </button>
        </div>
      </div>
    );
  }
}

export { ErrorBoundary };
