/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  // A plugin carrying its own nested `theme:` — must NOT leak into detected tokens.
  plugins: [{ config: { theme: { colors: { decoy: '#ff00ff' } } } }],
  theme: {
    // Base scale kept…
    colors: {
      base: '#111111'
    },
    extend: {
      // …and brand colors added under extend (the common pattern — must merge).
      colors: {
        brand: { 500: '#2563eb', 600: '#1d4ed8' },
        accent: '#f59e0b'
      },
      spacing: { gutter: '16px' }
    }
  }
}
