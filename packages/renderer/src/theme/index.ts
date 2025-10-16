import type { MantineThemeOverride } from '@mantine/core'

/**
 * Magi Browser Orchestrator 主题配置
 * 
 * 设计原则：
 * - 侧边栏与根背景共享统一色调
 * - 内容区域使用卡片提升层次
 * - 深色优先，支持暗色模式
 * - 与 Tailwind 配置保持一致
 */
export const theme: MantineThemeOverride = {
  /** 默认颜色方案 */
  primaryColor: 'blue',

  /** 颜色定义 */
  colors: {
    // 主色调 - 与 Tailwind primary 一致
    blue: [
      '#e6f0ff',
      '#cce0ff',
      '#99c2ff',
      '#66a3ff',
      '#3385ff',
      '#0066ff', // primary-600
      '#0052cc',
      '#003d99',
      '#002966',
      '#001433',
    ],
    // 深色背景色板
    dark: [
      '#C1C2C5', // text-secondary
      '#A6A7AB', // text-tertiary
      '#909296',
      '#5C5F66',
      '#373A40',
      '#2C2E33', // bg-elevated (卡片背景)
      '#25262B', // bg-secondary
      '#1A1B1E', // bg-primary (侧边栏、根背景)
      '#141517',
      '#101113',
    ],
  },

  /** 字体配置 */
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  fontFamilyMonospace: '"SF Mono", Monaco, "Cascadia Code", "Roboto Mono", Consolas, "Courier New", monospace',

  /** 间距配置 */
  spacing: {
    xs: '0.5rem',   // 8px
    sm: '0.75rem',  // 12px
    md: '1rem',     // 16px
    lg: '1.5rem',   // 24px
    xl: '2rem',     // 32px
  },

  /** 圆角配置 */
  radius: {
    xs: '0.125rem', // 2px
    sm: '0.25rem',  // 4px
    md: '0.5rem',   // 8px
    lg: '0.75rem',  // 12px
    xl: '1rem',     // 16px
  },

  /** 阴影配置 */
  shadows: {
    xs: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
    sm: '0 1px 3px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.1)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1), 0 2px 4px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.1), 0 10px 10px rgba(0, 0, 0, 0.04)',
  },

  /** 组件默认属性 */
  components: {
    AppShell: {
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-dark-7)', // bg-primary
        },
        main: {
          backgroundColor: 'var(--mantine-color-dark-7)',
        },
        navbar: {
          backgroundColor: 'var(--mantine-color-dark-7)', // 侧边栏与根背景一致
          borderRight: '1px solid var(--mantine-color-dark-6)',
        },
      },
    },

    Card: {
      defaultProps: {
        radius: 'md',
        shadow: 'sm',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--mantine-color-dark-5)', // bg-elevated
          borderColor: 'var(--mantine-color-dark-4)',
        },
      },
    },

    Tabs: {
      styles: {
        root: {
          backgroundColor: 'transparent',
        },
        list: {
          borderBottom: '1px solid var(--mantine-color-dark-4)',
        },
        tab: {
          color: 'var(--mantine-color-dark-1)',
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
          '&[dataActive]': {
            color: 'var(--mantine-color-blue-5)',
            borderColor: 'var(--mantine-color-blue-5)',
          },
        },
      },
    },

    NavLink: {
      styles: {
        root: {
          borderRadius: 'var(--mantine-radius-md)',
          '&[dataActive]': {
            backgroundColor: 'var(--mantine-color-dark-6)',
            color: 'var(--mantine-color-blue-5)',
          },
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
        },
      },
    },

    Button: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 500,
        },
      },
    },

    TextInput: {
      defaultProps: {
        radius: 'md',
      },
      styles: {
        input: {
          backgroundColor: 'var(--mantine-color-dark-6)',
          borderColor: 'var(--mantine-color-dark-4)',
          color: 'var(--mantine-color-dark-0)',
          '&:focus': {
            borderColor: 'var(--mantine-color-blue-5)',
          },
        },
      },
    },

    ActionIcon: {
      defaultProps: {
        radius: 'md',
      },
    },

    Modal: {
      styles: {
        content: {
          backgroundColor: 'var(--mantine-color-dark-5)',
        },
        header: {
          backgroundColor: 'var(--mantine-color-dark-5)',
          borderBottom: '1px solid var(--mantine-color-dark-4)',
        },
        body: {
          backgroundColor: 'var(--mantine-color-dark-5)',
        },
      },
    },

    Tooltip: {
      defaultProps: {
        withArrow: true,
        radius: 'sm',
      },
      styles: {
        tooltip: {
          backgroundColor: 'var(--mantine-color-dark-4)',
          color: 'var(--mantine-color-dark-0)',
        },
      },
    },

    Menu: {
      styles: {
        dropdown: {
          backgroundColor: 'var(--mantine-color-dark-5)',
          borderColor: 'var(--mantine-color-dark-4)',
        },
        item: {
          color: 'var(--mantine-color-dark-0)',
          '&:hover': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
          '&[data-hovered]': {
            backgroundColor: 'var(--mantine-color-dark-6)',
          },
        },
      },
    },

    ScrollArea: {
      styles: {
        scrollbar: {
          '&[data-orientation="vertical"] .mantine-ScrollArea-thumb': {
            backgroundColor: 'var(--mantine-color-dark-4)',
          },
          '&[data-orientation="horizontal"] .mantine-ScrollArea-thumb': {
            backgroundColor: 'var(--mantine-color-dark-4)',
          },
        },
      },
    },
  },

  /** 其他配置 */
  other: {
    // 自定义配置可以放在这里
    sidebarWidth: 280,
    headerHeight: 60,
    tabHeight: 40,
  },
}

export default theme
