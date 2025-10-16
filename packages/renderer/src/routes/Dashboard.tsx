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
              <Grid.Col key={browser.browserId} span={{ base: 12, sm: 6, lg: 4 }}>
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

                  {/* 半透明信息栏 */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'rgba(0, 0, 0, 0.75)',
                      backdropFilter: 'blur(8px)',
                      padding: '8px 12px',
                    }}
                  >
                    <Stack gap={4}>
                      <Group justify="space-between" align="flex-start" gap="xs">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <Text fw={500} size="sm" truncate style={{ color: 'white' }}>
                            {activePage?.title || '新标签页'}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {activePage?.url || 'about:blank'}
                          </Text>
                        </div>
                        <Badge size="sm" variant="light">
                          {pageCount} 页
                        </Badge>
                      </Group>

                      <Group justify="space-between" align="center" gap="xs">
                        <Group gap={6}>
                          <Text size="xs" c="dimmed">
                            ID: {browser.browserId.slice(0, 8)}
                          </Text>
                          {browser.endpoints?.browserWSEndpoint && (
                            <Tooltip label="CDP 端点已就绪">
                              <Badge size="xs" variant="dot">
                                CDP
                              </Badge>
                            </Tooltip>
                          )}
                        </Group>
                        <Tooltip label="关闭浏览器">
                          <ActionIcon
                            variant="light"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDestroyBrowser(browser.browserId);
                            }}
                          >
                            <IconTrash size={14} />
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
