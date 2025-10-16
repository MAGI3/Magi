import { Card, Text, Title, Stack } from '@mantine/core';

export function AIAssistant() {
  return (
    <Stack gap="md">
      <Title order={1}>AI Assistant</Title>
      
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--bg-active)',
        }}
      >
        <Text size="lg" fw={500} mb="md">
          AI Assistant Workbench
        </Text>
        <Text c="dimmed">
          AI Assistant module implementation coming soon. This will host context-aware
          copilots that surface automation suggestions, summarize sessions, trigger inline
          assistance, and integrate multi-model connectors for enhanced productivity.
        </Text>
      </Card>
    </Stack>
  );
}
