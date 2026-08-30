import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // แยก vendor ออกจากโค้ดแอป — deploy ครั้งหน้าผู้ใช้ไม่ต้องโหลด react/supabase ใหม่
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'vendor-react';
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          return undefined;
        },
      },
    },
  },
});
