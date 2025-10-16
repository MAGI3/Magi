/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './packages/renderer/index.html',
    './packages/renderer/src/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // 主色调 - 与 Mantine 主题保持一致
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        // 语义化背景色
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-elevated': 'var(--bg-elevated)',
        'bg-hover': 'var(--bg-hover)',
        'bg-active': 'var(--bg-active)',
        // 语义化文本色
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        // 语义化边框色
        'border-primary': 'var(--border-primary)',
        'border-secondary': 'var(--border-secondary)',
      },
      backgroundColor: {
        // 背景色别名（用于 bg- 前缀）
        primary: 'var(--bg-primary)',
        secondary: 'var(--bg-secondary)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
        active: 'var(--bg-active)',
      },
      textColor: {
        // 文本色别名（用于 text- 前缀）
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
      },
      borderColor: {
        // 边框色别名（用于 border- 前缀）
        primary: 'var(--border-primary)',
        secondary: 'var(--border-secondary)',
        DEFAULT: 'var(--border-primary)',
      },
    },
  },
  plugins: [],
}
