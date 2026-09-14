/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ground: '#0E1419',
        surface: '#161E26',
        raised: '#1E2831',
        rule: '#33414E',
        ink: {
          DEFAULT: '#EDF2F6',
          dim: '#8DA0B2',
          faint: '#5C6C7C',
        },
        signal: {
          DEFAULT: '#4DA3FF',
          bg: '#132639',
        },
        caution: {
          DEFAULT: '#FFA23C',
          bg: '#2A1F10',
        },
      },
      fontFamily: {
        sans: ['Barlow', 'system-ui', 'sans-serif'],
        cond: ['Barlow Condensed', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
};
