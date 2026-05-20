/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Prompt', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
