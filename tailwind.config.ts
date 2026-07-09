import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Vercel-style dark palette — matches taskbash visual continuity
        canvas: '#0a0a0a',
        surface: '#111111',
        'surface-muted': '#171717',
        line: '#262626',
        'line-strong': '#3f3f3f',
        ink: '#fafafa',
        'ink-muted': '#a3a3a3',
        'ink-faint': '#737373',
      },
    },
  },
  plugins: [],
}

export default config
