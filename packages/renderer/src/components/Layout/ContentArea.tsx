import { Box } from '@mantine/core';
import type { ReactNode } from 'react';

interface ContentAreaProps {
  children: ReactNode;
}

/**
 * ContentArea 组件
 * 
 * 主内容区域容器，作为路由视图的渲染区域。
 * 提供统一的背景色和内边距，确保与侧边栏视觉协调。
 * 
 * 设计要点：
 * - 使用应用背景色 dark-7 (#1A1B1E)，与侧边栏保持一致
 * - 内边距 24px，确保内容不贴边
 * - 高度 100%，填满可用空间
 * - 支持滚动溢出内容
 * - 顶部区域支持拖拽窗口
 */
export function ContentArea({ children }: ContentAreaProps) {
  return (
    <Box
      component="main"
      style={{
        flex: 1,
        height: '100%',
        paddingRight: 14,
        paddingBottom: 14,
        paddingLeft: 8,
        overflowY: 'auto',
        position: 'relative',
      }}
    >
      {/* 可拖拽的顶部区域 */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 36,
          // @ts-ignore - Webkit 特定属性
          WebkitAppRegion: 'drag',
          cursor: 'move',
          zIndex: 1,
        }}
      />
      
      {/* 内容区域 */}
      <Box
        style={{
          paddingTop: 36,
          position: 'relative',
          zIndex: 2,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
