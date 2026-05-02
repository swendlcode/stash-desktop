import type { Config } from 'tailwindcss';

// Palette entries resolve via CSS custom properties so that classes like
// `bg-gray-900`, `text-stack-white`, `bg-stack-fire` flip automatically when
// `[data-theme="light"]` overrides are active (see src/index.css).
// Names keep their dark-theme semantics — the light theme provides inverted
// values under the same names. `--stack-white` is shorthand for "primary fg",
// not literally white.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // CSS vars are stored as `R G B` triplets in src/index.css so that
        // Tailwind's <alpha-value> placeholder can compose opacity modifiers
        // like `bg-stack-fire/10` → `rgb(var(--stack-fire) / 0.1)`.
        stack: {
          black: 'rgb(var(--stack-black) / <alpha-value>)',
          fire: 'rgb(var(--stack-fire) / <alpha-value>)',
          white: 'rgb(var(--stack-white) / <alpha-value>)',
        },
        gray: {
          900: 'rgb(var(--gray-900) / <alpha-value>)',
          800: 'rgb(var(--gray-800) / <alpha-value>)',
          700: 'rgb(var(--gray-700) / <alpha-value>)',
          600: 'rgb(var(--gray-600) / <alpha-value>)',
          500: 'rgb(var(--gray-500) / <alpha-value>)',
          400: 'rgb(var(--gray-400) / <alpha-value>)',
          300: 'rgb(var(--gray-300) / <alpha-value>)',
          200: 'rgb(var(--gray-200) / <alpha-value>)',
          100: 'rgb(var(--gray-100) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Stara', 'system-ui', 'sans-serif'],
        mono: ['"DM Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
