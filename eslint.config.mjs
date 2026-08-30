import react from 'eslint-plugin-react';

export default [
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window:'readonly', document:'readonly', navigator:'readonly', console:'readonly',
        alert:'readonly', confirm:'readonly', setTimeout:'readonly', clearTimeout:'readonly', setInterval:'readonly', clearInterval:'readonly',
        atob:'readonly', btoa:'readonly', Image:'readonly', FileReader:'readonly',
        Notification:'readonly', PointerEvent:'readonly', Event:'readonly', URL:'readonly',
        Blob:'readonly', fetch:'readonly', localStorage:'readonly', sessionStorage:'readonly', matchMedia:'readonly',
      },
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'no-undef': 'error',
      // สำคัญ: no-undef ไม่จับชื่อ component ที่อยู่ในตำแหน่ง JSX element (<Foo />)
      // เคยหลุดมาแล้วตอน refactor step 2 — Sidebar เรียก <ThemePicker/> โดยไม่ได้ import
      // build ก็ผ่าน เพราะ rollup มองว่าเป็น global → จอขาวทั้งแอปหลังล็อกอิน
      'react/jsx-no-undef': 'error',
    },
  },
];
