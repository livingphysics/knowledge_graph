import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#1a1a1a',
          muted: '#666',
        },
      },
    },
  },
  plugins: [],
};

export default config;
