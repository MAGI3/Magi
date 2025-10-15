import { Card, Text, Title, Stack } from '@mantine/core';
import { useParams } from 'react-router-dom';

export function BrowserDetail() {
  const { browserId, pageId } = useParams<{ browserId: string; pageId: string }>();

  return (
    <Stack gap="md">
      <Title order={1}>Browser Detail</Title>
      
      <Card
        shadow="sm"
        padding="lg"
        radius="md"
        style={{
          backgroundColor: 'var(--mantine-color-dark-5)',
        }}
      >
        <Text size="lg" fw={500} mb="md">
          Browser Instance
        </Text>
        <Text c="dimmed" mb="xs">
          Browser ID: {browserId || 'N/A'}
        </Text>
        <Text c="dimmed" mb="md">
          Page ID: {pageId || 'N/A'}
        </Text>
        <Text c="dimmed">
          Browser detail view implementation coming soon. This will display tabs,
          navigation controls, address bar, downloads panel, and DevTools toggles.
        </Text>
      </Card>
    </Stack>
  );
}
