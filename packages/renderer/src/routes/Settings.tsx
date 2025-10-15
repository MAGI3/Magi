import { Card, Text, Title, Stack } from '@mantine/core';

export function Settings() {
  return (
    <Stack gap="md">
      <Title order={1}>Settings</Title>
      
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Text size="lg" fw={500} mb="md">
          Application Settings
        </Text>
        <Text c="dimmed">
          Settings panel implementation coming soon. This will include CDP server
          configuration, theme preferences, keyboard shortcuts, and other application
          preferences.
        </Text>
      </Card>
    </Stack>
  );
}
