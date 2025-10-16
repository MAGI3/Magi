import { AppShell } from '@mantine/core';
import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { ContentArea } from './ContentArea';

interface AppLayoutProps {
  children: ReactNode;
}

/**
 * AppLayout 组件
 * 
 * 应用主布局，使用 Mantine AppShell 组合侧边栏和内容区域。
 * 
 * 布局结构：
 * - 左侧：窄边栏（64px），仅显示图标导航
 * - 右侧：自适应内容区域，渲染路由视图
 * 
 * 设计特点：
 * - 侧边栏与根背景共享统一色调，无硬分割线
 * - 无 Header 和 Footer，侧边栏从上到下完整占据左侧
 * - 内容区域自适应，支持响应式布局
 */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <AppShell
      navbar={{
        width: 64,
        breakpoint: 0, // 永不折叠侧边栏
      }}
      padding={0} // 移除默认内边距，由 ContentArea 控制
    >
      <AppShell.Navbar>
        <Sidebar />
      </AppShell.Navbar>

      <AppShell.Main>
        <ContentArea>{children}</ContentArea>
      </AppShell.Main>
    </AppShell>
  );
}
