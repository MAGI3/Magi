import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Stack,
  Tabs,
  TextInput,
  ActionIcon,
  Group,
  Button,
  Text,
  Badge,
  Progress,
  CloseButton,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconReload,
  IconPlus,
  IconX,
  IconTerminal,
  IconDownload,
} from '@tabler/icons-react';
import { usePageActions } from '../hooks';

export function BrowserDetail() {
  const { browserId, pageId } = useParams<{ browserId: string; pageId: string }>();
  const navigate = useNavigate();
  const {
    browser,
    pages,
    createPage,
    navigateToUrl,
    selectPage,
    closePage,
    reloadPage,
    goBack,
    goForward,
    getActivePage,
  } = usePageActions(browserId || '');

  const [addressBarValue, setAddressBarValue] = useState('');
  const [showDevTools, setShowDevTools] = useState(false);
  const browserHostRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const activePage = getActivePage();

  // Sync URL route with active page
  useEffect(() => {
    // 确保URL参数与实际激活的页面一致
    if (activePage && browserId && activePage.pageId !== pageId) {
      navigate(`/browser/${browserId}/${activePage.pageId}`, { replace: true });
    }
  }, [activePage?.pageId, browserId, pageId, navigate]);

  // Sync address bar with active page URL
  useEffect(() => {
    if (activePage?.url) {
      setAddressBarValue(activePage.url);
    }
  }, [activePage?.url]);

  // Setup ResizeObserver to sync BrowserView bounds
  useEffect(() => {
    const activePageId = activePage?.pageId;
    if (!browserHostRef.current || !browserId || !activePageId) return;

    const updateLayout = () => {
      if (!browserHostRef.current || !activePageId) return;
      
      const rect = browserHostRef.current.getBoundingClientRect();
      
      // Send layout update to main process
      // The bounds are relative to the renderer window's viewport
      window.magiApi.invokeBrowserAction({
        type: 'layout:update',
        browserId,
        pageId: activePageId,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      }).catch((err) => {
        console.error('Failed to update layout:', err);
      });
    };

    // Initial layout update
    updateLayout();

    const observer = new ResizeObserver(() => {
      updateLayout();
    });

    observer.observe(browserHostRef.current);
    resizeObserverRef.current = observer;

    return () => {
      observer.disconnect();
      resizeObserverRef.current = null;
    };
  }, [browserId, activePage?.pageId]);

  // Cleanup: Detach BrowserView when component unmounts
  useEffect(() => {
    return () => {
      if (browserId) {
        window.magiApi.invokeBrowserAction({
          type: 'browserview:detach',
          browserId,
        }).catch((err) => {
          console.error('Failed to detach BrowserView:', err);
        });
      }
    };
  }, [browserId]);

  // Handle address bar navigation
  const handleNavigate = () => {
    // 使用 activePage 而不是 URL 参数中的 pageId，确保导航到当前选中的 tab
    const targetPageId = activePage?.pageId;
    if (addressBarValue && browserId && targetPageId) {
      let url = addressBarValue.trim();
      
      // Add protocol if missing
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://')) {
        // Check if it looks like a domain
        if (url.includes('.') && !url.includes(' ')) {
          url = `https://${url}`;
        } else {
          // Treat as search query
          url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
        }
      }

      navigateToUrl(targetPageId, url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  const handleCreatePage = async () => {
    if (!browserId) return;
    
    // 手动创建标签页：不传 afterPageId，添加到最后
    const newPageId = await createPage();
    if (newPageId) {
      // 导航到新创建的标签页
      navigate(`/browser/${browserId}/${newPageId}`);
    }
  };

  const handleClosePage = async (targetPageId: string) => {
    if (!browserId || !targetPageId) return;

    const isClosingActivePage = targetPageId === activePage?.pageId;
    const pageIndex = pages.findIndex(p => p.pageId === targetPageId);
    
    // 如果关闭的是激活页面，先切换到相邻的页面
    if (isClosingActivePage && pages.length > 1) {
      // 优先选择右侧的页面，如果没有则选择左侧
      const nextPage = pages[pageIndex + 1] || pages[pageIndex - 1];
      if (nextPage) {
        await selectPage(nextPage.pageId);
        navigate(`/browser/${browserId}/${nextPage.pageId}`);
      }
    }
    
    // 执行关闭操作
    await closePage(targetPageId);
    
    // 如果关闭后没有页面了，返回到浏览器列表
    if (pages.length === 1) {
      navigate('/');
    }
  };

  const handleSelectTab = (value: string | null) => {
    if (value && browserId) {
      selectPage(value);
      // 同步更新 URL 路由，确保 pageId 参数与选中的 tab 一致
      navigate(`/browser/${browserId}/${value}`);
    }
  };

  const handleToggleDevTools = () => {
    setShowDevTools((prev) => !prev);
    const activePageId = activePage?.pageId;
    if (browserId && activePageId) {
      window.magiApi.invokeBrowserAction({
        type: 'devtools:toggle',
        browserId,
        pageId: activePageId,
      }).catch((err) => {
        console.error('Failed to toggle DevTools:', err);
      });
    }
  };

  if (!browser) {
    return (
      <Stack gap="md" className="h-full">
        <Card>
          <Text c="dimmed">Browser not found: {browserId}</Text>
        </Card>
      </Stack>
    );
  }

  return (
    <Card
      shadow="sm"
      padding={0}
      radius="md"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        height: 'calc(100dvh - 50px)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Stack gap={0} className="h-full">
        {/* Chrome-style Toolbar */}
        <div className="px-4 py-2.5 border-b border-primary bg-secondary">
        <Group gap="xs" wrap="nowrap">
          {/* Navigation Controls */}
          <ActionIcon.Group>
            <Tooltip label="后退">
              <ActionIcon
                variant="subtle"
                onClick={() => activePage?.pageId && goBack(activePage.pageId)}
                disabled={!activePage?.navigationState?.canGoBack}
                size="md"
              >
                <IconArrowLeft size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="前进">
              <ActionIcon
                variant="subtle"
                onClick={() => activePage?.pageId && goForward(activePage.pageId)}
                disabled={!activePage?.navigationState?.canGoForward}
                size="md"
              >
                <IconArrowRight size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="刷新">
              <ActionIcon
                variant="subtle"
                onClick={() => activePage?.pageId && reloadPage(activePage.pageId)}
                loading={activePage?.navigationState?.isLoading}
                size="md"
              >
                <IconReload size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </ActionIcon.Group>

          {/* Address Bar */}
          <TextInput
            placeholder="输入网址或搜索..."
            value={addressBarValue}
            onChange={(e) => setAddressBarValue(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1"
            size="sm"
            styles={{
              input: {
                borderRadius: '20px',
              },
            }}
            classNames={{
              input: 'bg-primary',
            }}
            leftSection={
              activePage?.favicon ? (
                <img
                  src={activePage.favicon}
                  alt="favicon"
                  className="w-4 h-4"
                />
              ) : null
            }
            rightSection={
              activePage?.navigationState?.isLoading ? (
                <Badge size="xs" variant="light">
                  加载中
                </Badge>
              ) : null
            }
          />

          {/* Toolbar Actions */}
          <Group gap="xs">
            <Tooltip label={showDevTools ? '隐藏开发者工具' : '显示开发者工具'}>
              <ActionIcon
                variant={showDevTools ? 'light' : 'subtle'}
                onClick={handleToggleDevTools}
                size="md"
              >
                <IconTerminal size={18} stroke={1.5} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </div>

      {/* Browser Tabs */}
      <div className="px-2 pt-1 bg-secondary">
        <Tabs
          value={activePage?.pageId}
          onChange={handleSelectTab}
          variant="pills"
          classNames={{
            root: 'browser-tabs',
            list: 'gap-1 items-center',
            tab: 'rounded-t-lg rounded-b-none data-[active=true]:bg-hover',
          }}
        >
          <Tabs.List>
            {pages.map((page) => (
              <Tabs.Tab
                key={page.pageId}
                value={page.pageId}
                leftSection={
                  page.favicon ? (
                    <img
                      src={page.favicon}
                      alt="favicon"
                      className="w-4 h-4"
                    />
                  ) : null
                }
                rightSection={
                  pages.length > 1 ? (
                    <CloseButton
                      size="xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClosePage(page.pageId);
                      }}
                      icon={<IconX size={12} />}
                    />
                  ) : null
                }
              >
                <Text size="sm" className="max-w-[120px] truncate">
                  {page.title || '新标签页'}
                </Text>
              </Tabs.Tab>
            ))}
            <Tooltip label="新建标签页">
              <ActionIcon
                variant="subtle"
                onClick={handleCreatePage}
                size="md"
                className="ml-1 self-center"
              >
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          </Tabs.List>
        </Tabs>
      </div>

      {/* BrowserView Content Area */}
      <div className="flex-1 overflow-hidden bg-primary">
        {pages.map((page) => (
          <div
            key={page.pageId}
            ref={page.pageId === activePage?.pageId ? browserHostRef : null}
            className="browser-host w-full h-full"
            style={{
              display: page.pageId === activePage?.pageId ? 'block' : 'none',
              minHeight: '400px',
            }}
          >
            {/* BrowserView will be attached here by main process */}
          </div>
        ))}
      </div>

      {/* Downloads Panel - Fixed at bottom when active */}
      {activePage?.downloadState && activePage.downloadState.items.length > 0 && (
        <div className="border-t border-primary bg-secondary p-3">
          <Stack gap="xs">
            <Group gap="xs" className="px-2">
              <IconDownload size={16} stroke={1.5} />
              <Text size="sm" fw={500}>
                下载 ({activePage.downloadState.items.length})
              </Text>
            </Group>
            <div className="max-h-32 overflow-y-auto">
              <Stack gap="xs">
                {activePage.downloadState.items.map((download) => (
                  <div
                    key={download.id}
                    className="px-3 py-2 rounded-lg bg-elevated"
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div className="flex-1 min-w-0">
                        <Text size="sm" fw={500} className="truncate">
                          {download.fileName}
                        </Text>
                        <Group gap="xs" mt={4}>
                          <Text size="xs" c="dimmed">
                            {download.state === 'progressing' && download.receivedBytes && download.totalBytes
                              ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                              : download.state === 'completed'
                              ? '已完成'
                              : download.state === 'cancelled'
                              ? '已取消'
                              : download.state}
                          </Text>
                          {download.state === 'progressing' && download.receivedBytes && download.totalBytes && (
                            <Progress
                              value={(download.receivedBytes / download.totalBytes) * 100}
                              size="xs"
                              className="flex-1"
                            />
                          )}
                        </Group>
                      </div>
                      {download.state === 'progressing' && (
                        <Button
                          size="xs"
                          variant="light"
                          onClick={() => {
                            window.magiApi.invokeBrowserAction({
                              type: 'download:cancel',
                              browserId: browserId || '',
                              pageId: activePage.pageId,
                              downloadId: download.id,
                            });
                          }}
                        >
                          取消
                        </Button>
                      )}
                    </Group>
                  </div>
                ))}
              </Stack>
            </div>
          </Stack>
        </div>
      )}
      </Stack>
    </Card>
  );
}
