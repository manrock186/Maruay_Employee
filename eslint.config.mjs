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
        Blob:'readonly', fetch:'readonly', localStorage:'readonly', matchMedia:'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
