import { ActionIcon, Stack, useMantineColorScheme } from '@mantine/core'
import {
  IconBrowser,
  IconRobot,
  IconSettings,
  IconAutomation,
  IconMoon,
  IconSun,
} from '@tabler/icons-react'
import { useLocation, useNavigate } from 'react-router-dom'

/**
 * 侧边栏导航项配置
 */
const navItems = [
  {
    id: 'browser',
    label: 'Browser',
    icon: IconBrowser,
    path: '/',
    description: '浏览器实例管理',
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: IconAutomation,
    path: '/automation',
    description: '自动化脚本',
    disabled: true, // 占位模块
  },
  {
    id: 'ai-assistant',
    label: 'AI Assistant',
    icon: IconRobot,
    path: '/ai-assistant',
    description: 'AI 辅助工具',
    disabled: true, // 占位模块
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: IconSettings,
    path: '/settings',
    description: '应用设置',
  },
]

/**
 * Sidebar 组件
 * 
 * 窄边栏导航（64px），仅显示图标，包含：
 * - Logo 标识
 * - 导航图标（Browser、Automation、AI Assistant、Settings）
 * - 主题切换按钮（底部）
 * 
 * 设计特点：
 * - 与根背景共享统一色调（无硬分割线）
 * - 使用 ActionIcon + Tooltip 实现图标导航
 * - 支持路由高亮
 * - 占位模块显示禁用状态
 * - 主题切换按钮（暗色/浅色）
 */
export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toggleColorScheme } = useMantineColorScheme()

  return (
    <div className="h-full flex flex-col items-center py-4">
      {/* Logo / Brand - 简化为单字母 */}
      <div className="w-10 h-10 rounded-full flex items-center justify-center mt-8 mb-12 shadow-lg bg-elevated">
        <span className="font-bold text-lg text-primary">M</span>
      </div>

      {/* Navigation Icons */}
      <Stack gap="md" className="flex-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path

          return (
            <ActionIcon
              key={item.id}
              size="xl"
              variant={isActive ? 'filled' : 'subtle'}
              disabled={item.disabled}
              onClick={() => !item.disabled && navigate(item.path)}
              styles={{
                root: {
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.4 : 1,
                },
              }}
            >
              <Icon size={22} stroke={1.5} />
            </ActionIcon>
          )
        })}
      </Stack>

      {/* Theme Toggle Button */}
      <ActionIcon
        size="xl"
        variant="subtle"
        onClick={() => toggleColorScheme()}
        className="[&_svg]:transition-transform [&_svg]:duration-300"
      >
        <IconMoon size={22} stroke={1.5} className="dark:hidden" />
        <IconSun size={22} stroke={1.5} className="hidden dark:block" />
      </ActionIcon>
    </div>
  )
}

export default Sidebar
