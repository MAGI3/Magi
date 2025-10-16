import { Card, Text, Stack, Group, SegmentedControl, useMantineColorScheme } from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

export function Settings() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  return (
    <Stack gap="md">
      {/* 主题设置卡片 */}
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--bg-elevated)',
        }}
      >
        <Group justify="space-between" mb="xs">
          <div>
            <Text size="sm" fw={500} style={{ color: 'var(--text-primary)' }}>
              主题外观
            </Text>
            <Text size="xs" style={{ color: 'var(--text-tertiary)' }} mt={4}>
              选择应用的视觉主题
            </Text>
          </div>
          <SegmentedControl
            value={colorScheme}
            onChange={(value) => setColorScheme(value as 'light' | 'dark')}
            data={[
              {
                value: 'light',
                label: (
                  <Group gap={8} wrap="nowrap">
                    <IconSun size={16} />
                    <Text size="sm">浅色</Text>
                  </Group>
                ),
              },
              {
                value: 'dark',
                label: (
                  <Group gap={8} wrap="nowrap">
                    <IconMoon size={16} />
                    <Text size="sm">暗色</Text>
                  </Group>
                ),
              },
            ]}
          />
        </Group>
      </Card>

      {/* 其他设置卡片 */}
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--bg-elevated)',
        }}
      >
        <Text size="sm" fw={500} mb="xs" style={{ color: 'var(--text-primary)' }}>
          应用设置
        </Text>
        <Text size="xs" style={{ color: 'var(--text-tertiary)' }}>
          更多设置功能即将推出，包括 CDP 服务器配置、键盘快捷键等。
        </Text>
      </Card>
    </Stack>
  );
}
