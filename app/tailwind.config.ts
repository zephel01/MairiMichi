import type { Config } from 'tailwindcss'

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // アクセス難易度は色のみに依存しない（アイコン＋文言と併用する）
        access: {
          train: '#1a7f5a',
          bus: '#8a6d1f',
          car: '#9a3f3f',
          unknown: '#5a5a5a',
        },
      },
    },
  },
  plugins: [],
} satisfies Config
