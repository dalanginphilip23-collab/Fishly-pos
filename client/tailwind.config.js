export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ocean: '#08264B',
        wave: '#0076B8',
        cyan: '#18BCE0',
        sky: '#E8F5FC',
        foam: '#F3F8FC',
        sun: '#FFCA28',
        coral: '#D62839',
      },
      fontFamily: {
        display: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
