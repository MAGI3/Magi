import {
  Card,
  Text,
  Title,
  Stack,
  Grid,
  Button,
  Group,
  ActionIcon,
  Image,
  Badge,
  Tooltip,
} from '@mantine/core';
import { IconPlus, IconTrash, IconExternalLink } from '@tabler/icons-react';
import { useBrowserFleetStore } from '../store/browserFleetStore';
import { useBrowserActions } from '../hooks/useBrowserActions';
import { useNavigation } from '../hooks/useNavigation';
import type { ManagedBrowser, ManagedPage } from '@magi/shared-state';

export function Dashboard() {
  const browsers = useBrowserFleetStore((state) => state.browsers);
  const { createBrowser, destroyBrowser } = useBrowserActions();
  const { goToBrowserDetail } = useNavigation();

  const handleCreateBrowser = async () => {
    const { browserId, pageId } = await createBrowser();
    goToBrowserDetail(browserId, pageId);
  };

  const handleDestroyBrowser = async (browserId: string) => {
    if (confirm('确定要关闭此浏览器吗？')) {
      await destroyBrowser(browserId);
    }
  };

  const handleOpenBrowser = (browserId: string, pageId?: string) => {
    if (pageId) {
      goToBrowserDetail(browserId, pageId);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={3}>浏览器编排中心</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleCreateBrowser}
          variant="light"
        >
          创建新浏览器
        </Button>
      </Group>

      {browsers.length === 0 ? (
        <Card
          shadow="sm"
          padding="xl"
          radius="md"
          style={{
            backgroundColor: 'var(--bg-active)',
          }}
        >
          <Stack align="center" gap="md" py="xl">
            <Text size="lg" fw={500} c="dimmed">
              暂无浏览器实例
            </Text>
            <Text size="sm" c="dimmed" ta="center">
              点击上方"创建新浏览器"按钮开始创建您的第一个浏览器实例
            </Text>
          </Stack>
        </Card>
      ) : (
        <Grid gutter="md">
          {browsers.map((browser: ManagedBrowser) => {
            const activePage = browser.pages.find((p: ManagedPage) => p.pageId === browser.activePageId);
            const pageCount = browser.pages.length;

            return (
              <Grid.Col key={browser.browserId} span={{ base: 12, sm: 6, md: 4, lg: 3, xl: 2.4 }}>
                <Card
                  shadow="sm"
                  padding={0}
                  radius="md"
                  style={{
                    backgroundColor: 'var(--bg-active)',
                    aspectRatio: '16 / 9',
                    position: 'relative',
                    overflow: 'hidden',
                    cursor: activePage ? 'pointer' : 'default',
                  }}
                  onClick={() => activePage && handleOpenBrowser(browser.browserId, activePage.pageId)}
                >
                  {/* 背景截图 */}
                  {activePage?.thumbnail?.dataUrl ? (
                    <Image
                      src={activePage.thumbnail.dataUrl}
                      alt="Browser thumbnail"
                      fit="cover"
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                    />
                  ) : (
                    <div
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        backgroundColor: 'var(--bg-elevated)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text c="dimmed" size="sm">
                        无缩略图
                      </Text>
                    </div>
                  )}

                  {/* 信息栏 - 使用渐变背景提升一致性 */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.85) 60%, rgba(0, 0, 0, 0.6) 100%)',
                      backdropFilter: 'blur(12px)',
                      WebkitBackdropFilter: 'blur(12px)',
                      padding: '12px',
                      borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                    }}
                  >
                    <Stack gap={6}>
                      <Group justify="space-between" align="flex-start" gap="xs">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={600} size="sm" truncate style={{ color: 'rgba(255, 255, 255, 0.95)' }}>
                            {activePage?.title || '新标签页'}
                          </Text>
                          <Text size="xs" truncate style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                            {activePage?.url || 'about:blank'}
                          </Text>
                        </div>
                        <Badge 
                          size="sm" 
                          variant="light"
                          style={{
                            backgroundColor: 'rgba(255, 255, 255, 0.15)',
                            color: 'rgba(255, 255, 255, 0.9)',
                          }}
                        >
                          {pageCount} 页
                        </Badge>
                      </Group>

                      <Group justify="space-between" align="center" gap="xs">
                        <Group gap={8}>
                          <Text size="xs" style={{ color: 'rgba(255, 255, 255, 0.5)' }}>
                            ID: {browser.browserId.slice(0, 8)}
                          </Text>
                          {browser.endpoints?.browserWSEndpoint && (
                            <Tooltip label="CDP 端点已就绪">
                              <Group gap={4} style={{ 
                                padding: '2px 8px',
                                borderRadius: '4px',
                                backgroundColor: 'rgba(34, 197, 94, 0.15)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                              }}>
                                <div style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '50%',
                                  backgroundColor: '#22c55e',
                                  boxShadow: '0 0 8px rgba(34, 197, 94, 0.6)',
                                  animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
                                }} />
                                <Text size="xs" fw={500} style={{ color: '#22c55e' }}>
                                  CDP
                                </Text>
                              </Group>
                            </Tooltip>
                          )}
                        </Group>
                        <Tooltip label="关闭浏览器">
                          <ActionIcon
                            color="red"
                            variant="light"
                            size="sm"
                            style={{
                              backgroundColor: 'rgba(239, 68, 68, 0.15)',
                              '&:hover': {
                                backgroundColor: 'rgba(239, 68, 68, 0.25)',
                              }
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDestroyBrowser(browser.browserId);
                            }}
                          >
                            <IconTrash size={14} style={{ color: '#ef4444' }} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Stack>
                  </div>
                </Card>
              </Grid.Col>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
