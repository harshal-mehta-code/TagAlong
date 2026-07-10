/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: '#FAF7F0',
        ink: '#251C31',
        'ink-soft': '#5C5168',
        curtain: '#33224A',
        'curtain-deep': '#221537',
        'curtain-card': '#2C1D42',
        'curtain-line': '#3A2C4C',
        brass: '#C79A3D',
        'brass-soft': '#E3C685',
        record: '#D64545',
        tenor: '#8FB7E8',
        lead: '#E06A5A',
        bari: '#C79A3D',
        bass: '#5E8C6E',
        paper: '#FFFFFF',
        line: '#E4DDD0',
      },
      fontFamily: {
        serif: ['"New York"', 'ui-serif', 'Charter', 'Georgia', 'serif'],
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: { card: '18px' },
    },
  },
  plugins: [],
}
