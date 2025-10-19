import { test, expect } from '@playwright/test';
import { chromium, type Browser, type BrowserContext, type CDPSession } from 'playwright';
import WebSocket from 'ws';

const CDP_BASE_URL = 'http://localhost:9222';

// 全局测试变量
let testBrowserId: string;
let testPageId: string;
let testBrowserWSEndpoint: string;
let testPageWSEndpoint: string;

// 在所有测试之前创建 browser 实例
test.beforeAll(async ({ request }) => {
  const response = await request.post(`${CDP_BASE_URL}/test/browser/create`, {
    data: {},
  });

  expect(response.status()).toBe(200);
  const data = await response.json();
  
  expect(data.ok).toBe(true);
  expect(data.browserId).toBeDefined();
  expect(data.pageId).toBeDefined();
  expect(data.browserWSEndpoint).toBeDefined();
  expect(data.pageWSEndpoint).toBeDefined();

  testBrowserId = data.browserId;
  testPageId = data.pageId;
  testBrowserWSEndpoint = data.browserWSEndpoint;
  testPageWSEndpoint = data.pageWSEndpoint;

  console.log('Test browser created:', {
    browserId: testBrowserId,
    pageId: testPageId,
    browserWSEndpoint: testBrowserWSEndpoint,
    pageWSEndpoint: testPageWSEndpoint,
  });
});

// 在所有测试之后清理 browser 实例
test.afterAll(async ({ request }) => {
  if (testBrowserId) {
    const response = await request.delete(`${CDP_BASE_URL}/test/browser/${testBrowserId}`);
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.ok).toBe(true);
    
    console.log('Test browser destroyed:', testBrowserId);
  }
});

// Helper: 等待 WebSocket 消息
function waitForMessage(ws: WebSocket, method: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${method}`));
    }, timeout);

    const handler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.method === method) {
          clearTimeout(timer);
          ws.off('message', handler);
          resolve(message);
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    ws.on('message', handler);
  });
}

// Helper: 发送 CDP 命令并等待响应
function sendCdpCommand(
  ws: WebSocket,
  id: number,
  method: string,
  params?: Record<string, any>
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout waiting for response to ${method}`));
    }, 5000);

    const handler = (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (message.id === id) {
          clearTimeout(timer);
          ws.off('message', handler);
          if (message.error) {
            reject(new Error(message.error.message));
          } else {
            resolve(message.result);
          }
        }
      } catch (e) {
        // 忽略解析错误
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params: params || {} }));
  });
}

test.describe('CDP Gateway - Discovery Endpoints', () => {
  test('should return version information at /json/version', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/version`);
    expect(response.status()).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty('Browser');
    expect(data).toHaveProperty('Protocol-Version');
    expect(data).toHaveProperty('User-Agent');
    expect(data).toHaveProperty('WebKit-Version');
    expect(data.Browser).toContain('Magi');
  });

  test('should return target list at /json/list', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    expect(response.status()).toBe(200);

    const targets = await response.json();
    expect(Array.isArray(targets)).toBe(true);
    // 可能有一些默认的 browser target
  });

  test('should return protocol definition at /json/protocol', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/protocol`);
    expect(response.status()).toBe(200);

    const protocol = await response.json();
    expect(protocol).toHaveProperty('version');
    expect(protocol).toHaveProperty('domains');
    expect(Array.isArray(protocol.domains)).toBe(true);
  });
});

test.describe('CDP Gateway - Browser WebSocket Endpoint', () => {
  let ws: WebSocket;
  let messageId = 1;

  test.beforeEach(async ({ request }) => {
    // 先获取可用的 browser target
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTarget = targets.find((t: any) => t.type === 'browser');

    if (browserTarget && browserTarget.webSocketDebuggerUrl) {
      ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
      await new Promise((resolve) => ws.once('open', resolve));
    }
  });

  test.afterEach(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  test('should connect to browser WebSocket endpoint', async () => {
    expect(ws).toBeDefined();
    expect(ws.readyState).toBe(WebSocket.OPEN);
  });

  test('should enable Target domain and discover targets', async () => {
    if (!ws) {
      test.skip();
      return;
    }

    // 启用 Target 域
    const result = await sendCdpCommand(ws, messageId++, 'Target.setDiscoverTargets', {
      discover: true,
    });
    expect(result).toBeDefined();

    // 获取所有 targets
    const targetsResult = await sendCdpCommand(ws, messageId++, 'Target.getTargets');
    expect(targetsResult).toHaveProperty('targetInfos');
    expect(Array.isArray(targetsResult.targetInfos)).toBe(true);
  });

  test('should create new page target via Target.createTarget', async () => {
    if (!ws) {
      test.skip();
      return;
    }

    // 启用 Target 发现
    await sendCdpCommand(ws, messageId++, 'Target.setDiscoverTargets', { discover: true });

    // 等待 targetCreated 事件
    const targetCreatedPromise = waitForMessage(ws, 'Target.targetCreated');

    // 创建新页面
    const createResult = await sendCdpCommand(ws, messageId++, 'Target.createTarget', {
      url: 'about:blank',
    });

    expect(createResult).toHaveProperty('targetId');
    const targetId = createResult.targetId;

    // 验证收到 targetCreated 事件
    const targetCreatedEvent = await targetCreatedPromise;
    expect(targetCreatedEvent.params.targetInfo.targetId).toBe(targetId);
    expect(targetCreatedEvent.params.targetInfo.type).toBe('page');
  });

  test('should attach to page target and send Page commands', async () => {
    if (!ws) {
      test.skip();
      return;
    }

    // 启用 Target 发现
    await sendCdpCommand(ws, messageId++, 'Target.setDiscoverTargets', { discover: true });

    // 创建新页面
    const createResult = await sendCdpCommand(ws, messageId++, 'Target.createTarget', {
      url: 'about:blank',
    });
    const targetId = createResult.targetId;

    // 等待 attachedToTarget 事件
    const attachedPromise = waitForMessage(ws, 'Target.attachedToTarget');

    // 附加到目标
    const attachResult = await sendCdpCommand(ws, messageId++, 'Target.attachToTarget', {
      targetId,
      flatten: true,
    });

    expect(attachResult).toHaveProperty('sessionId');
    const sessionId = attachResult.sessionId;

    // 验证收到 attachedToTarget 事件
    const attachedEvent = await attachedPromise;
    expect(attachedEvent.params.sessionId).toBe(sessionId);
    expect(attachedEvent.params.targetInfo.targetId).toBe(targetId);

    // 通过 session 发送 Page.navigate 命令
    const navigateResult = await sendCdpCommand(
      ws,
      messageId++,
      'Target.sendMessageToTarget',
      {
        sessionId,
        message: JSON.stringify({
          id: 999,
          method: 'Page.navigate',
          params: { url: 'https://www.example.com' },
        }),
      }
    );

    // 应该收到 Target.receivedMessageFromTarget 事件
    // 这里我们简单验证命令被发送成功
    expect(navigateResult).toBeDefined();
  });
});

test.describe('CDP Gateway - Page WebSocket Endpoint', () => {
  let browserWs: WebSocket;
  let pageWs: WebSocket | null = null;
  let messageId = 1;
  let pageTargetId: string;

  test.beforeEach(async ({ request }) => {
    // 连接到 browser endpoint
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTarget = targets.find((t: any) => t.type === 'browser');

    if (!browserTarget) {
      throw new Error('No browser target found');
    }

    browserWs = new WebSocket(browserTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => browserWs.once('open', resolve));

    // 创建一个页面
    await sendCdpCommand(browserWs, messageId++, 'Target.setDiscoverTargets', {
      discover: true,
    });
    const createResult = await sendCdpCommand(browserWs, messageId++, 'Target.createTarget', {
      url: 'about:blank',
    });
    pageTargetId = createResult.targetId;
  });

  test.afterEach(() => {
    if (pageWs && pageWs.readyState === WebSocket.OPEN) {
      pageWs.close();
    }
    if (browserWs && browserWs.readyState === WebSocket.OPEN) {
      browserWs.close();
    }
  });

  test('should connect directly to page WebSocket endpoint', async ({ request }) => {
    // 获取页面的 WebSocket URL
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const pageTarget = targets.find((t: any) => t.id === pageTargetId);

    expect(pageTarget).toBeDefined();
    expect(pageTarget.webSocketDebuggerUrl).toBeDefined();

    // 连接到页面 WebSocket
    pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => pageWs.once('open', resolve));

    expect(pageWs.readyState).toBe(WebSocket.OPEN);
  });

  test('should send Page commands directly to page endpoint', async ({ request }) => {
    // 获取页面的 WebSocket URL
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const pageTarget = targets.find((t: any) => t.id === pageTargetId);

    expect(pageTarget).toBeDefined();
    expect(pageTarget.webSocketDebuggerUrl).toBeDefined();

    pageWs = new WebSocket(pageTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => pageWs!.once('open', resolve));

    // 确保 pageWs 已连接
    if (!pageWs) {
      throw new Error('Failed to connect to page WebSocket');
    }

    let cmdId = 1;

    // 启用 Page 域
    const enableResult = await sendCdpCommand(pageWs, cmdId++, 'Page.enable');
    expect(enableResult).toBeDefined();

    // 导航到 URL
    const navigateResult = await sendCdpCommand(pageWs, cmdId++, 'Page.navigate', {
      url: 'https://www.example.com',
    });
    expect(navigateResult).toBeDefined();
  });
});

test.describe('CDP Gateway - Multi-Client Support', () => {
  test('should support multiple clients connecting to different browsers', async ({
    request,
  }) => {
    // 获取现有的 browser targets
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTargets = targets.filter((t: any) => t.type === 'browser');

    // 如果只有一个 browser，这个测试可能需要先创建多个 browser
    // 这里我们至少验证可以连接到一个 browser
    expect(browserTargets.length).toBeGreaterThan(0);

    const ws1 = new WebSocket(browserTargets[0].webSocketDebuggerUrl);
    await new Promise((resolve) => ws1.once('open', resolve));

    expect(ws1.readyState).toBe(WebSocket.OPEN);

    // 验证可以发送命令
    const result = await sendCdpCommand(ws1, 1, 'Target.getTargets');
    expect(result).toHaveProperty('targetInfos');

    ws1.close();
  });

  test('should support multiple clients connecting to same page', async ({ request }) => {
    // 先创建一个页面
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTarget = targets.find((t: any) => t.type === 'browser');

    const browserWs = new WebSocket(browserTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => browserWs.once('open', resolve));

    await sendCdpCommand(browserWs, 1, 'Target.setDiscoverTargets', { discover: true });
    const createResult = await sendCdpCommand(browserWs, 2, 'Target.createTarget', {
      url: 'about:blank',
    });
    const pageTargetId = createResult.targetId;

    // 获取页面的 WebSocket URL
    const response2 = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets2 = await response2.json();
    const pageTarget = targets2.find((t: any) => t.id === pageTargetId);

    // 创建两个客户端连接到同一个页面
    const ws1 = new WebSocket(pageTarget.webSocketDebuggerUrl);
    const ws2 = new WebSocket(pageTarget.webSocketDebuggerUrl);

    await Promise.all([
      new Promise((resolve) => ws1.once('open', resolve)),
      new Promise((resolve) => ws2.once('open', resolve)),
    ]);

    expect(ws1.readyState).toBe(WebSocket.OPEN);
    expect(ws2.readyState).toBe(WebSocket.OPEN);

    // 两个客户端都可以发送命令
    const result1 = await sendCdpCommand(ws1, 1, 'Page.enable');
    const result2 = await sendCdpCommand(ws2, 1, 'Page.enable');

    expect(result1).toBeDefined();
    expect(result2).toBeDefined();

    ws1.close();
    ws2.close();
    browserWs.close();
  });
});

test.describe('CDP Gateway - UI Synchronization', () => {
  test('should broadcast Target.targetCreated when page is created via CDP', async ({
    request,
  }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTarget = targets.find((t: any) => t.type === 'browser');

    // 创建两个客户端连接
    const ws1 = new WebSocket(browserTarget.webSocketDebuggerUrl);
    const ws2 = new WebSocket(browserTarget.webSocketDebuggerUrl);

    await Promise.all([
      new Promise((resolve) => ws1.once('open', resolve)),
      new Promise((resolve) => ws2.once('open', resolve)),
    ]);

    // 两个客户端都启用 Target 发现
    await sendCdpCommand(ws1, 1, 'Target.setDiscoverTargets', { discover: true });
    await sendCdpCommand(ws2, 1, 'Target.setDiscoverTargets', { discover: true });

    // 客户端 2 等待 targetCreated 事件
    const targetCreatedPromise = waitForMessage(ws2, 'Target.targetCreated');

    // 客户端 1 创建新页面
    const createResult = await sendCdpCommand(ws1, 2, 'Target.createTarget', {
      url: 'about:blank',
    });

    // 客户端 2 应该收到 targetCreated 事件
    const targetCreatedEvent = await targetCreatedPromise;
    expect(targetCreatedEvent.params.targetInfo.targetId).toBe(createResult.targetId);

    ws1.close();
    ws2.close();
  });

  test('should broadcast Target.targetDestroyed when page is closed', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/list`);
    const targets = await response.json();
    const browserTarget = targets.find((t: any) => t.type === 'browser');

    const ws = new WebSocket(browserTarget.webSocketDebuggerUrl);
    await new Promise((resolve) => ws.once('open', resolve));

    await sendCdpCommand(ws, 1, 'Target.setDiscoverTargets', { discover: true });

    // 创建页面
    const createResult = await sendCdpCommand(ws, 2, 'Target.createTarget', {
      url: 'about:blank',
    });
    const targetId = createResult.targetId;

    // 等待 targetDestroyed 事件
    const targetDestroyedPromise = waitForMessage(ws, 'Target.targetDestroyed');

    // 关闭页面
    await sendCdpCommand(ws, 3, 'Target.closeTarget', { targetId });

    // 验证收到 targetDestroyed 事件
    const targetDestroyedEvent = await targetDestroyedPromise;
    expect(targetDestroyedEvent.params.targetId).toBe(targetId);

    ws.close();
  });
});

test.describe('CDP Gateway - Playwright Integration', () => {
  let browser: Browser;
  let context: BrowserContext;

  test.afterEach(async () => {
    if (context) {
      await context.close();
    }
    if (browser) {
      await browser.close();
    }
  });

  test('should connect via Playwright connectOverCDP', async ({ request }) => {
    // 获取 browser endpoint
    const response = await request.get(`${CDP_BASE_URL}/json/version`);
    const version = await response.json();
    
    expect(version.webSocketDebuggerUrl).toBeDefined();

    // 使用 Playwright 连接
    browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
    expect(browser).toBeDefined();
    expect(browser.isConnected()).toBe(true);
  });

  test('should create and navigate pages via Playwright', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/version`);
    const version = await response.json();

    browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
    
    // 获取或创建 context
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    // 创建新页面
    const page = await context.newPage();
    expect(page).toBeDefined();

    // 导航到 URL
    await page.goto('https://www.example.com');
    expect(page.url()).toContain('example.com');

    // 验证页面标题
    const title = await page.title();
    expect(title).toBeTruthy();

    await page.close();
  });

  test('should handle multiple pages via Playwright', async ({ request }) => {
    const response = await request.get(`${CDP_BASE_URL}/json/version`);
    const version = await response.json();

    browser = await chromium.connectOverCDP(version.webSocketDebuggerUrl);
    const contexts = browser.contexts();
    context = contexts.length > 0 ? contexts[0] : await browser.newContext();

    // 创建多个页面
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    await Promise.all([
      page1.goto('https://www.example.com'),
      page2.goto('https://www.google.com'),
    ]);

    expect(page1.url()).toContain('example.com');
    expect(page2.url()).toContain('google.com');

    await page1.close();
    await page2.close();
  });
});
