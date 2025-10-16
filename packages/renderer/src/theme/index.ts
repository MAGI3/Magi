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
    // 浅色背景色板
    gray: [
      '#F8F9FA', // bg-primary (浅色模式根背景)
      '#F1F3F5', // bg-secondary
      '#E9ECEF',
      '#DEE2E6',
      '#CED4DA',
      '#ADB5BD',
      '#868E96',
      '#495057',
      '#343A40',
      '#212529',
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

  /** 阴影配置 - 增强卡片层级感 */
  shadows: {
    xs: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.1)',
    sm: '0 2px 4px rgba(0, 0, 0, 0.12), 0 1px 2px rgba(0, 0, 0, 0.08)',
    md: '0 4px 8px rgba(0, 0, 0, 0.15), 0 2px 4px rgba(0, 0, 0, 0.1)',
    lg: '0 8px 16px rgba(0, 0, 0, 0.18), 0 4px 8px rgba(0, 0, 0, 0.12)',
    xl: '0 16px 32px rgba(0, 0, 0, 0.2), 0 8px 16px rgba(0, 0, 0, 0.15)',
  },

  /** 组件默认属性 */
  components: {
    AppShell: {
      styles: {
        root: {
          backgroundColor: 'var(--bg-primary)',
        },
        main: {
          backgroundColor: 'var(--bg-primary)',
        },
        navbar: {
          backgroundColor: 'var(--bg-primary)',
          border: 'none',
          borderRight: 'none',
        },
      },
    },

    Card: {
      defaultProps: {
        radius: 'md',
        shadow: 'md',
        withBorder: false,
      },
      styles: {
        root: {
          backgroundColor: 'var(--bg-elevated)',
          transition: 'box-shadow 0.2s ease',
          '&:hover': {
            boxShadow: 'var(--mantine-shadow-lg)',
          },
        },
      },
    },

    Tabs: {
      styles: {
        root: {
          backgroundColor: 'transparent',
        },
        list: {
          borderBottom: '1px solid var(--border-primary)',
        },
        tab: {
          color: 'var(--text-secondary)',
          '&:hover': {
            backgroundColor: 'var(--bg-hover)',
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
            backgroundColor: 'var(--bg-hover)',
            color: 'var(--mantine-color-blue-5)',
          },
          '&:hover': {
            backgroundColor: 'var(--bg-hover)',
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
          backgroundColor: 'var(--bg-hover)',
          borderColor: 'var(--border-primary)',
          color: 'var(--text-primary)',
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
          backgroundColor: 'var(--bg-elevated)',
        },
        header: {
          backgroundColor: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-primary)',
        },
        body: {
          backgroundColor: 'var(--bg-elevated)',
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
          backgroundColor: 'var(--bg-elevated)',
          color: 'var(--text-primary)',
        },
      },
    },

    Menu: {
      styles: {
        dropdown: {
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--border-primary)',
        },
        item: {
          color: 'var(--text-primary)',
          '&:hover': {
            backgroundColor: 'var(--bg-hover)',
          },
          '&[data-hovered]': {
            backgroundColor: 'var(--bg-hover)',
          },
        },
      },
    },

    ScrollArea: {
      styles: {
        scrollbar: {
          '&[data-orientation="vertical"] .mantine-ScrollArea-thumb': {
            backgroundColor: 'var(--border-primary)',
          },
          '&[data-orientation="horizontal"] .mantine-ScrollArea-thumb': {
            backgroundColor: 'var(--border-primary)',
          },
        },
      },
    },
  },

  /** 其他配置 */
  other: {
    // 自定义配置可以放在这里
    sidebarWidth: 64, // 窄边栏,仅显示图标
    headerHeight: 60,
    tabHeight: 40,
  },
}

export default theme
