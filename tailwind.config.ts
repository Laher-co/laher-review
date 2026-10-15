import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        inter: ['var(--font-inter)', 'sans-serif'],
        serif: ['var(--font-playfair)', 'Georgia', 'serif'],
        helvetica: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        cream: '#FAF9F6',
        // LAHER brand: warm off-white/beige with chocolate accents
        ivory: '#F8F4EE',
        linen: '#F1EAE0',
        sand:  '#E4D9CB',
        cocoa: {
          DEFAULT: '#4A3022',
          dark:    '#36231A',
          light:   '#7A5A47',
        },
        ink:   '#2B211B',
        stone: '#8C7B6E',
      },
    },
  },
  plugins: [],
}

export default config
