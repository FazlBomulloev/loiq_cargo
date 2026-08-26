import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        app: 'var(--bg-app)',
        elev: 'var(--bg-elev)',
        card: 'var(--bg-card)',
        input: 'var(--bg-input)',
        hover: 'var(--bg-hover)',
        ink: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
        },
        line: {
          strong: 'var(--line-strong)',
          DEFAULT: 'var(--line)',
          hair: 'var(--line-hair)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          strong: 'var(--accent-strong)',
          tint: 'var(--accent-tint)',
        },
        good: {
          DEFAULT: 'var(--good)',
          tint: 'var(--good-tint)',
        },
        warn: {
          DEFAULT: 'var(--warn)',
          tint: 'var(--warn-tint)',
        },
        crit: {
          DEFAULT: 'var(--crit)',
          tint: 'var(--crit-tint)',
        },
        info: {
          DEFAULT: 'var(--info)',
          tint: 'var(--info-tint)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: [
          'IBM Plex Mono', 'ui-monospace', 'Menlo', 'monospace',
        ],
        serif: [
          'Fraunces', 'Iowan Old Style', 'Georgia', 'serif',
        ],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1.4' }],
        xs: ['0.6875rem', { lineHeight: '1.5' }],
        sm: ['0.78rem', { lineHeight: '1.55' }],
        md: ['0.875rem', { lineHeight: '1.55' }],
        lg: ['1rem', { lineHeight: '1.55' }],
        xl: ['1.25rem', { lineHeight: '1.35' }],
        '2xl': ['1.625rem', { lineHeight: '1.25' }],
        '3xl': ['2.125rem', { lineHeight: '1.1' }],
        '4xl': ['2.75rem', { lineHeight: '1.05' }],
      },
      borderRadius: {
        none: '0',
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '10px',
        full: '999px',
      },
      boxShadow: {
        hair: 'inset 0 -1px 0 var(--line-hair)',
        card:
          '0 1px 0 rgba(180,90,43,.03), ' +
          '0 4px 12px -8px rgba(80,50,20,.14)',
        pop: '0 6px 24px -10px rgba(80,50,20,.22)',
        focus: '0 0 0 3px var(--accent-tint)',
      },
      transitionTimingFunction: {
        soft: 'cubic-bezier(.2,.6,.2,1)',
      },
      transitionDuration: {
        fast: '120ms',
        med: '200ms',
        slow: '320ms',
      },
    },
  },
  plugins: [],
}

export default config
