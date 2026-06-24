/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 500: '#2563eb', 600: '#1d4ed8' },
        accent: '#f59e0b'
      },
      spacing: { gutter: '16px' }
    }
  }
}
