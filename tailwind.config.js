/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        paper: '#F4F3EE',
        ink: '#262626',
        border: '#CFC9BE',
        card: '#FFFDF8',
        header: '#E8E3D9',
        accent: '#54473A',
        highlight: '#d47d2b',
      },
      boxShadow: {
        card: '0 3px 6px rgba(58, 45, 34, 0.08)',
      },
      borderRadius: {
        card: '13px',
      },
    },
  },
  plugins: [],
};
