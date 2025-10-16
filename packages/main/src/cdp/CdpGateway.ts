import http from 'node:http';
import Koa from 'koa';
import Router from 'koa-router';
import WebSocket, { WebSocketServer } from 'ws';
import cors from '@koa/cors';
import { BrowserFleetManager } from '../fleet/BrowserFleetManager.js';
import type { BrowserFleetState } from '@magi/ipc-schema';
import { logger } from '../utils/logger.js';
import { CdpSessionManager } from './CdpSessionManager.js';

export interface CdpGatewayOptions {
  host?: string;
  port?: number;
}

interface WebSocketClient {
  ws: WebSocket;
  browserId?: string;
  pageId?: string;
  discoverTargets?: boolean;
  attachedTargets?: Set<string>;
}

interface CdpMessage {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface CdpResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: {
    code: number;
    message: string;
  };
}

interface CdpEvent {
  method: string;
  params: Record<string, unknown>;
}

export class CdpGateway {
  private readonly koa = new Koa();
  private readonly router = new Router();
  private readonly server: http.Server;
  private wss: WebSocketServer | null = null;
  private started = false;
  private clients = new Set<WebSocketClient>();
  private readonly sessionManager = new CdpSessionManager();

  constructor(
    private readonly fleetManager: BrowserFleetManager,
    private readonly options: CdpGatewayOptions = {}
  ) {
    this.server = http.createServer(this.koa.callback());
    this.configureRoutes();
  }

  private configureRoutes() {
    this.router.get('/json/version', async (ctx) => {
      const state = this.fleetManager.getState();
      ctx.body = this.buildVersionPayload(state);
    });

    this.router.get('/json/list', async (ctx) => {
      const state = this.fleetManager.getState();
      ctx.body = this.buildListPayload(state);
    });

    this.router.get('/json/protocol', async (ctx) => {
      ctx.body = {}; // Placeholder for future protocol descriptor
    });

    this.koa
      .use(
        cors({
          origin: '*'
        })
      )
      .use(this.router.routes())
      .use(this.router.allowedMethods());
  }

  private buildVersionPayload(state: BrowserFleetState) {
    return {
      Browser: 'Chrome/128.0.0.0',
      'Protocol-Version': '1.3',
      'User-Agent': 'Magi Browser Orchestrator',
      'V8-Version': '12.8.21',
      'WebKit-Version': '537.36 (@magi/orchestrator)',
      webSocketDebuggerUrl:
        state.browsers[0]?.endpoints.browserWSEndpoint ?? 'ws://localhost:9222/devtools/browser'
    };
  }

  private buildListPayload(state: BrowserFleetState) {
    const targets = [];

    for (const browser of state.browsers) {
      targets.push({
        id: browser.browserId,
        type: 'browser',
        title: browser.name,
        attached: false,
        webSocketDebuggerUrl: browser.endpoints.browserWSEndpoint
      });

      for (const page of browser.pages) {
        targets.push({
          id: page.pageId,
          browserId: browser.browserId,
          type: 'page',
          url: page.url ?? 'about:blank',
          title: page.title ?? 'New Tab',
          attached: !page.isActive,
          webSocketDebuggerUrl: page.wsEndpoint,
          faviconUrl: page.favicon ?? undefined
        });
      }
    }

    return targets;
  }

  async start() {
    if (this.started) return;
    const host = this.options.host ?? '0.0.0.0';
    const port = this.options.port ?? 9222;

    this.wss = new WebSocketServer({
      server: this.server,
      path: '/devtools'
    });

    this.wss.on('connection', async (ws, request) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? ''}`);
      const [, , targetType, targetId] = url.pathname.split('/');

      const client: WebSocketClient = {
        ws,
        browserId: targetType === 'browser' ? targetId : undefined,
        pageId: targetType === 'page' ? targetId : undefined
      };

      this.clients.add(client);

      logger.info('CDP client connected', { targetType, targetId });

      // For page connections, attach to CDP session
      if (targetType === 'page' && targetId) {
        const page = this.fleetManager.getPage(targetId);
        if (page) {
          const clientId = `${targetId}-${Date.now()}`;
          await this.sessionManager.attachClient(
            targetId,
            page.view.webContents,
            clientId,
            {
              send: (message: string) => {
                if (ws.readyState === WebSocket.OPEN) {
                  ws.send(message);
                }
              },
              close: () => {
                ws.close();
              }
            }
          );

          ws.on('message', (message) => {
            logger.debug('CDP message received', {
              targetType,
              targetId,
              message: message.toString()
            });
            this.sessionManager.handleClientMessage(targetId, clientId, message.toString());
          });

          ws.on('close', () => {
            logger.info('CDP client disconnected', { targetType, targetId });
            this.sessionManager.detachClient(targetId, clientId);
            this.clients.delete(client);
          });
        } else {
          logger.warn('Page not found for CDP connection', { pageId: targetId });
          ws.close();
          return;
        }
      } else if (targetType === 'browser' && targetId) {
        // For browser connections, implement Target.* API
        client.discoverTargets = false;
        client.attachedTargets = new Set();

        ws.on('message', (message) => {
          logger.debug('CDP message received (browser target)', {
            targetType,
            targetId,
            message: message.toString()
          });
          this.handleBrowserMessage(client, targetId, message.toString());
        });

        ws.on('close', () => {
          logger.info('CDP client disconnected', { targetType, targetId });
          this.clients.delete(client);
        });
      } else {
        logger.warn('Unknown target type or missing targetId', { targetType, targetId });
        ws.close();
        return;
      }

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error, targetType, targetId });
      });
    });

    await new Promise<void>((resolve) => {
      this.server.listen(port, host, () => {
        logger.info('CDP gateway listening', { host, port });
        resolve();
      });
    });

    this.started = true;
  }

  async stop() {
    if (!this.started) return;

    for (const client of this.clients) {
      client.ws.close();
    }
    this.clients.clear();

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    this.wss?.close();
    this.wss = null;
    this.started = false;
  }

  private handleBrowserMessage(client: WebSocketClient, browserId: string, message: string) {
    try {
      const msg = JSON.parse(message) as CdpMessage;

      switch (msg.method) {
        case 'Target.setDiscoverTargets':
          this.handleSetDiscoverTargets(client, browserId, msg);
          break;
        case 'Target.createTarget':
          this.handleCreateTarget(client, browserId, msg);
          break;
        case 'Target.attachToTarget':
          this.handleAttachToTarget(client, browserId, msg);
          break;
        case 'Target.sendMessageToTarget':
          this.handleSendMessageToTarget(client, browserId, msg);
          break;
        case 'Target.detachFromTarget':
          this.handleDetachFromTarget(client, browserId, msg);
          break;
        case 'Target.getTargets':
          this.handleGetTargets(client, browserId, msg);
          break;
        default:
          logger.warn('Unhandled CDP method', { method: msg.method, browserId });
          this.sendResponse(client.ws, {
            id: msg.id,
            error: {
              code: -32601,
              message: `Method not found: ${msg.method}`
            }
          });
      }
    } catch (error) {
      logger.error('Failed to parse CDP message', { error, message });
    }
  }

  private handleSetDiscoverTargets(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const discover = msg.params?.discover as boolean;
    client.discoverTargets = discover;

    logger.info('Target discovery toggled', { browserId, discover });

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });

    // If discovery is enabled, send existing targets
    if (discover) {
      const browser = this.fleetManager.getBrowser(browserId);
      if (browser) {
        for (const page of browser.pagesList) {
          const pageModel = browser.store.getPage(page.pageId);
          this.sendEvent(client.ws, {
            method: 'Target.targetCreated',
            params: {
              targetInfo: {
                targetId: page.pageId,
                type: 'page',
                title: pageModel?.title ?? 'New Tab',
                url: pageModel?.url ?? 'about:blank',
                attached: client.attachedTargets?.has(page.pageId) ?? false,
                canAccessOpener: false,
                browserContextId: browserId
              }
            }
          });
        }
      }
    }
  }

  private handleCreateTarget(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    const url = (msg.params?.url as string) ?? 'about:blank';

    logger.info('Creating new target', { browserId, url });

    const page = this.fleetManager.createPage({
      browserId,
      url,
      activate: false
    });

    if (!page) {
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32000,
          message: 'Failed to create target'
        }
      });
      return;
    }

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        targetId: page.pageId
      }
    });

    // Notify discovery if enabled
    if (client.discoverTargets) {
      const browser = this.fleetManager.getBrowser(browserId);
      const pageModel = browser?.store.getPage(page.pageId);
      this.sendEvent(client.ws, {
        method: 'Target.targetCreated',
        params: {
          targetInfo: {
            targetId: page.pageId,
            type: 'page',
            title: pageModel?.title ?? 'New Tab',
            url: pageModel?.url ?? url,
            attached: false,
            canAccessOpener: false,
            browserContextId: browserId
          }
        }
      });
    }
  }

  private async handleAttachToTarget(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const targetId = msg.params?.targetId as string;
    const flatten = msg.params?.flatten as boolean;

    if (!targetId) {
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32602,
          message: 'Missing targetId parameter'
        }
      });
      return;
    }

    logger.info('Attaching to target', { browserId, targetId, flatten });

    const page = this.fleetManager.getPage(targetId);
    if (!page) {
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32000,
          message: `Target not found: ${targetId}`
        }
      });
      return;
    }

    // Create a session for this attachment
    const sessionId = `${targetId}-session-${Date.now()}`;
    client.attachedTargets?.add(targetId);

    if (flatten) {
      // In flattened mode, attach the CDP session directly
      await this.sessionManager.attachClient(targetId, page.view.webContents, sessionId, {
        send: (message: string) => {
          // Wrap in Target.receivedMessageFromTarget
          this.sendEvent(client.ws, {
            method: 'Target.receivedMessageFromTarget',
            params: {
              sessionId,
              message,
              targetId
            }
          });
        },
        close: () => {
          logger.info('CDP session closed', { sessionId, targetId });
        }
      });
    }

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        sessionId
      }
    });

    // Notify about attachment
    if (client.discoverTargets) {
      const browser = this.fleetManager.getBrowser(browserId);
      const pageModel = browser?.store.getPage(page.pageId);
      this.sendEvent(client.ws, {
        method: 'Target.attachedToTarget',
        params: {
          sessionId,
          targetInfo: {
            targetId: page.pageId,
            type: 'page',
            title: pageModel?.title ?? 'New Tab',
            url: pageModel?.url ?? 'about:blank',
            attached: true,
            canAccessOpener: false,
            browserContextId: browserId
          },
          waitingForDebugger: false
        }
      });
    }
  }

  private handleSendMessageToTarget(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const targetMessage = msg.params?.message as string;
    const sessionId = msg.params?.sessionId as string;

    if (!targetMessage || !sessionId) {
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32602,
          message: 'Missing message or sessionId parameter'
        }
      });
      return;
    }

    // Extract targetId from sessionId (format: targetId-session-timestamp)
    const targetId = sessionId.split('-session-')[0];

    logger.debug('Sending message to target', {
      browserId,
      targetId,
      sessionId,
      message: targetMessage
    });

    // Forward the message to the CDP session manager
    this.sessionManager.handleClientMessage(targetId, sessionId, targetMessage);

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });
  }

  private handleDetachFromTarget(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const sessionId = msg.params?.sessionId as string;

    if (!sessionId) {
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32602,
          message: 'Missing sessionId parameter'
        }
      });
      return;
    }

    const targetId = sessionId.split('-session-')[0];
    logger.info('Detaching from target', { browserId, targetId, sessionId });

    this.sessionManager.detachClient(targetId, sessionId);
    client.attachedTargets?.delete(targetId);

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });

    if (client.discoverTargets) {
      this.sendEvent(client.ws, {
        method: 'Target.detachedFromTarget',
        params: {
          sessionId,
          targetId
        }
      });
    }
  }

  private handleGetTargets(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    const browser = this.fleetManager.getBrowser(browserId);
    const targetInfos = [];

    if (browser) {
      for (const page of browser.pagesList) {
        const pageModel = browser.store.getPage(page.pageId);
        targetInfos.push({
          targetId: page.pageId,
          type: 'page',
          title: pageModel?.title ?? 'New Tab',
          url: pageModel?.url ?? 'about:blank',
          attached: client.attachedTargets?.has(page.pageId) ?? false,
          canAccessOpener: false,
          browserContextId: browserId
        });
      }
    }

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        targetInfos
      }
    });
  }

  private sendResponse(ws: WebSocket, response: CdpResponse) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  private sendEvent(ws: WebSocket, event: CdpEvent) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  broadcastState(state: BrowserFleetState) {
    const payload = JSON.stringify({
      method: 'Browser.stateUpdate',
      params: state
    });

    for (const client of this.clients) {
      client.ws.send(payload);
    }
  }
}
