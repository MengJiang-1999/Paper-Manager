/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"SF Pro Text"',
          '"Inter"',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          'sans-serif',
        ],
        serif: [
          '"New York"',
          'Georgia',
          '"Songti SC"',
          'serif',
        ],
        mono: [
          '"SF Mono"',
          'Menlo',
          'Monaco',
          'monospace',
        ],
      },
      colors: {
        paper: {
          50: '#FAF9F6',
          100: '#F4F2EC',
          200: '#E8E4DA',
          300: '#D6CFC0',
        },
      },
    },
  },
  plugins: [],
};
