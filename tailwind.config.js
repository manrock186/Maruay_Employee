/** @type {import('tailwindcss').Config} */
// สี emerald (สีหลัก) และ amber (สีรอง) ถูก map เป็น CSS variables
// เพื่อให้เปลี่ยนธีมทั้งแอปได้จาก data-theme (ดูค่าตัวแปรใน src/index.css)
const primary = {
  50: 'rgb(var(--c-primary-50) / <alpha-value>)',
  100: 'rgb(var(--c-primary-100) / <alpha-value>)',
  200: 'rgb(var(--c-primary-200) / <alpha-value>)',
  300: 'rgb(var(--c-primary-300) / <alpha-value>)',
  400: 'rgb(var(--c-primary-400) / <alpha-value>)',
  500: 'rgb(var(--c-primary-500) / <alpha-value>)',
  600: 'rgb(var(--c-primary-600) / <alpha-value>)',
  700: 'rgb(var(--c-primary-700) / <alpha-value>)',
  800: 'rgb(var(--c-primary-800) / <alpha-value>)',
  900: 'rgb(var(--c-primary-900) / <alpha-value>)',
  950: 'rgb(var(--c-primary-950) / <alpha-value>)',
};
const accent = {
  50: 'rgb(var(--c-accent-50) / <alpha-value>)',
  100: 'rgb(var(--c-accent-100) / <alpha-value>)',
  200: 'rgb(var(--c-accent-200) / <alpha-value>)',
  300: 'rgb(var(--c-accent-300) / <alpha-value>)',
  400: 'rgb(var(--c-accent-400) / <alpha-value>)',
  500: 'rgb(var(--c-accent-500) / <alpha-value>)',
  600: 'rgb(var(--c-accent-600) / <alpha-value>)',
  700: 'rgb(var(--c-accent-700) / <alpha-value>)',
  800: 'rgb(var(--c-accent-800) / <alpha-value>)',
  900: 'rgb(var(--c-accent-900) / <alpha-value>)',
  950: 'rgb(var(--c-accent-950) / <alpha-value>)',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        emerald: primary,
        amber: accent,
      },
      fontFamily: {
        sans: ['Prompt', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
