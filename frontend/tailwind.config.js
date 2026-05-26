/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // GitHub Primer dark color scale
        'git-bg': {
          primary: '#0d1117',
          secondary: '#161b22',
          tertiary: '#21262d',
          overlay: '#1c2128',
        },
        'git-border': {
          DEFAULT: '#30363d',
          subtle: '#21262d',
          strong: '#484f58',
        },
        'git-text': {
          primary: '#e6edf3',
          secondary: '#8b949e',
          tertiary: '#6e7681',
          link: '#58a6ff',
          placeholder: '#484f58',
        },
        'git-accent': {
          blue: '#58a6ff',
          'blue-hover': '#79c0ff',
          green: '#3fb950',
          'green-hover': '#56d364',
          'green-bg': '#238636',
          'green-bg-hover': '#2ea043',
          red: '#f85149',
          orange: '#d29922',
          purple: '#a371f7',
        },
        'git-btn': {
          primary: '#238636',
          'primary-hover': '#2ea043',
          secondary: '#21262d',
          'secondary-hover': '#30363d',
          danger: '#da3633',
          'danger-hover': '#f85149',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'SF Mono', 'Menlo', 'Consolas', 'Liberation Mono', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      boxShadow: {
        'git': '0 0 0 1px #30363d, 0 1px 3px rgba(0,0,0,0.12)',
        'git-lg': '0 0 0 1px #30363d, 0 8px 24px rgba(1,4,9,0.4)',
        'git-btn': '0 0 0 1px rgba(255,255,255,0.15) inset, 0 1px 0 rgba(0,0,0,0.15)',
        'glow-green': '0 0 0 1px #238636, 0 2px 8px rgba(35,134,54,0.15)',
      },
    },
  },
  plugins: [],
}
