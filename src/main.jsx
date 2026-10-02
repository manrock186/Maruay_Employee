import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import './index.css';

// เลื่อนล้อเมาส์/trackpad ตอนเคอร์เซอร์อยู่ในช่องตัวเลข เบราว์เซอร์จะเปลี่ยนค่าในช่อง (เลขขึ้น-ลงเองโดยไม่รู้ตัว)
// → ทั้งแอป: ถ้าช่องตัวเลขที่กำลังโฟกัสโดน wheel ให้ blur ทิ้งก่อน ค่าไม่เปลี่ยน และหน้าเลื่อนตามปกติ
document.addEventListener('wheel', (e) => {
  const el = document.activeElement;
  if (el && el.tagName === 'INPUT' && el.type === 'number' && (e.target === el || el.contains(e.target))) el.blur();
}, { passive: true, capture: true });

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
