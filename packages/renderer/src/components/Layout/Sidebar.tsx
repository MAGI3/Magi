import { NavLink, Stack, Text } from '@mantine/core'
import {
  IconBrowser,
  IconRobot,
  IconSettings,
  IconAutomation,
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
 * 侧边栏导航，包含 Browser、Automation、AI Assistant、Settings 模块入口
 * 设计特点：
 * - 与根背景共享统一色调（dark-7: #1A1B1E）
 * - 使用 Mantine NavLink 组件
 * - 支持路由高亮
 * - 占位模块禁用状态
 */
export function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="h-full flex flex-col">
      {/* Logo / Brand */}
      <div className="p-6 border-b border-dark-4">
        <Text size="xl" fw={700} c="blue.5">
          Magi
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          Browser Orchestrator
        </Text>
      </div>

      {/* Navigation */}
      <Stack gap="xs" p="md" className="flex-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = location.pathname === item.path

          return (
            <NavLink
              key={item.id}
              label={item.label}
              description={item.disabled ? '即将推出' : item.description}
              leftSection={<Icon size={20} stroke={1.5} />}
              active={isActive}
              disabled={item.disabled}
              onClick={() => !item.disabled && navigate(item.path)}
              styles={{
                root: {
                  cursor: item.disabled ? 'not-allowed' : 'pointer',
                  opacity: item.disabled ? 0.5 : 1,
                },
              }}
            />
          )
        })}
      </Stack>

      {/* Footer */}
      <div className="p-4 border-t border-dark-4">
        <Text size="xs" c="dimmed" ta="center">
          v0.1.0-alpha
        </Text>
      </div>
    </div>
  )
}

export default Sidebar
