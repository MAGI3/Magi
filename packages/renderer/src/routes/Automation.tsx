import { Card, Text, Title, Stack } from '@mantine/core';

export function Automation() {
  return (
    <Stack gap="md">
      <Title order={1}>Automation</Title>
      
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Text size="lg" fw={500} mb="md">
          Automation Workbench
        </Text>
        <Text c="dimmed">
          Automation module implementation coming soon. This will host script library,
          schedule manager, workflow builder, and integration with Playwright/Puppeteer
          recipes to orchestrate multi-browser automation runs.
        </Text>
      </Card>
    </Stack>
  );
}
