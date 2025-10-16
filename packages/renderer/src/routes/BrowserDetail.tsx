import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Card,
  Stack,
  Tabs,
  TextInput,
  ActionIcon,
  Group,
  Button,
  Text,
  Title,
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

  // Sync address bar with active page URL
  useEffect(() => {
    if (activePage?.url) {
      setAddressBarValue(activePage.url);
    }
  }, [activePage?.url]);

  // Setup ResizeObserver to sync BrowserView bounds
  useEffect(() => {
    if (!browserHostRef.current || !browserId || !pageId) return;

    const updateLayout = () => {
      if (!browserHostRef.current) return;
      
      const rect = browserHostRef.current.getBoundingClientRect();
      
      // Send layout update to main process
      // The bounds are relative to the renderer window's viewport
      window.magiApi.invokeBrowserAction({
        type: 'layout:update',
        browserId,
        pageId,
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
  }, [browserId, pageId]);

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
    if (addressBarValue && browserId && pageId) {
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

      navigateToUrl(pageId, url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleNavigate();
    }
  };

  const handleCreatePage = async () => {
    if (browserId) {
      await createPage();
    }
  };

  const handleClosePage = async (targetPageId: string) => {
    if (browserId && targetPageId) {
      await closePage(targetPageId);
    }
  };

  const handleSelectTab = (value: string | null) => {
    if (value && browserId) {
      selectPage(value);
    }
  };

  const handleToggleDevTools = () => {
    setShowDevTools((prev) => !prev);
    // TODO: Send IPC to toggle DevTools in main process
    if (browserId && pageId) {
      window.magiApi.invokeBrowserAction({
        type: 'devtools:toggle',
        browserId,
        pageId,
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
    <Stack gap="md" className="h-full">
      {/* Header with Browser Info */}
      <Card>
        <Group justify="space-between">
          <div>
            <Title order={3}>Browser: {browser.browserId}</Title>
            <Text size="sm" c="dimmed">
              {pages.length} page{pages.length !== 1 ? 's' : ''} open
            </Text>
          </div>
          <Group gap="xs">
            <Tooltip label={showDevTools ? 'Hide DevTools' : 'Show DevTools'}>
              <ActionIcon
                variant={showDevTools ? 'filled' : 'light'}
                onClick={handleToggleDevTools}
                size="lg"
              >
                <IconTerminal size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </Card>

      {/* Navigation Controls & Address Bar */}
      <Card>
        <Stack gap="md">
          <Group gap="xs">
            <ActionIcon.Group>
              <Tooltip label="Go Back">
                <ActionIcon
                  variant="light"
                  onClick={() => pageId && goBack(pageId)}
                  disabled={!activePage?.navigationState?.canGoBack}
                >
                  <IconArrowLeft size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Go Forward">
                <ActionIcon
                  variant="light"
                  onClick={() => pageId && goForward(pageId)}
                  disabled={!activePage?.navigationState?.canGoForward}
                >
                  <IconArrowRight size={18} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Reload">
                <ActionIcon
                  variant="light"
                  onClick={() => pageId && reloadPage(pageId)}
                  loading={activePage?.navigationState?.isLoading}
                >
                  <IconReload size={18} />
                </ActionIcon>
              </Tooltip>
            </ActionIcon.Group>

            <TextInput
              placeholder="Enter URL or search..."
              value={addressBarValue}
              onChange={(e) => setAddressBarValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="flex-1"
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
                  <Badge size="xs" color="blue">
                    Loading...
                  </Badge>
                ) : null
              }
            />
          </Group>
        </Stack>
      </Card>

      {/* Tabs & Browser Content */}
      <Card className="flex-1 flex flex-col overflow-hidden">
        <Tabs
          value={activePage?.pageId}
          onChange={handleSelectTab}
          classNames={{
            root: 'flex flex-col h-full',
            list: 'flex-shrink-0',
            panel: 'flex-1 overflow-hidden',
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
                <Text size="sm" className="max-w-[150px] truncate">
                  {page.title || 'New Page'}
                </Text>
              </Tabs.Tab>
            ))}
            <Tabs.Tab
              value="__new__"
              onClick={(e) => {
                e.preventDefault();
                handleCreatePage();
              }}
            >
              <IconPlus size={16} />
            </Tabs.Tab>
          </Tabs.List>

          {pages.map((page) => (
            <Tabs.Panel key={page.pageId} value={page.pageId} className="h-full">
              <div
                ref={page.pageId === pageId ? browserHostRef : null}
                className="browser-host w-full h-full bg-white rounded"
                style={{ minHeight: '400px' }}
              >
                {/* BrowserView will be attached here by main process */}
              </div>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Card>

      {/* Downloads Panel (conditional) */}
      {activePage?.downloadState && activePage.downloadState.items.length > 0 && (
        <Card>
          <Stack gap="sm">
            <Group justify="space-between">
              <Group gap="xs">
                <IconDownload size={18} />
                <Text fw={500}>Downloads</Text>
              </Group>
            </Group>
            {activePage.downloadState.items.map((download) => (
              <Card key={download.id} withBorder>
                <Group justify="space-between">
                  <div className="flex-1">
                    <Text size="sm" fw={500} className="truncate">
                      {download.fileName}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {download.state === 'progressing' && download.receivedBytes && download.totalBytes
                        ? `${Math.round((download.receivedBytes / download.totalBytes) * 100)}%`
                        : download.state}
                    </Text>
                    {download.state === 'progressing' && download.receivedBytes && download.totalBytes && (
                      <Progress
                        value={(download.receivedBytes / download.totalBytes) * 100}
                        size="sm"
                        className="mt-1"
                      />
                    )}
                  </div>
                  {download.state === 'progressing' && (
                    <Button
                      size="xs"
                      variant="light"
                      color="red"
                      onClick={() => {
                        window.magiApi.invokeBrowserAction({
                          type: 'download:cancel',
                          browserId: browserId || '',
                          pageId: activePage.pageId,
                          downloadId: download.id,
                        });
                      }}
                    >
                      Cancel
                    </Button>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>
        </Card>
      )}
    </Stack>
  );
}
