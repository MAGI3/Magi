import http from 'node:http';
import Koa from 'koa';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
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
  autoAttach?: {
    enabled: boolean;
    waitForDebuggerOnStart: boolean;
    flatten: boolean;
  };
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

  constructor(
    private readonly fleetManager: BrowserFleetManager,
    private readonly sessionManager: CdpSessionManager,
    private readonly options: CdpGatewayOptions = {}
  ) {
    this.server = http.createServer(this.koa.callback());
    this.configureRoutes();
  }

  private configureRoutes() {
    // Configure body parser middleware for JSON request bodies
    this.koa.use(bodyParser());

    // Test-only endpoints for browser lifecycle management
    // Only enabled in non-production environments
    logger.info('Configuring CDP routes', { 
      NODE_ENV: process.env.NODE_ENV,
      testEndpointsEnabled: process.env.NODE_ENV !== 'production'
    });
    
    if (process.env.NODE_ENV !== 'production') {
      this.router.post('/test/browser/create', async (ctx) => {
        try {
          const options = ctx.request.body || {};
          const browser = this.fleetManager.createBrowser(options);
          const activePage = browser.getActivePage();
          
          ctx.body = {
            ok: true,
            browserId: browser.browserId,
            pageId: activePage?.pageId,
            browserWSEndpoint: browser.model?.endpoints.browserWSEndpoint,
            pageWSEndpoint: activePage?.wsEndpoint
          };
        } catch (error) {
          logger.error('Failed to create browser via test endpoint', { error });
          ctx.status = 500;
          ctx.body = {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });

      this.router.delete('/test/browser/:browserId', async (ctx) => {
        try {
          const { browserId } = ctx.params;
          const browser = this.fleetManager.getBrowser(browserId);
          
          if (!browser) {
            ctx.status = 404;
            ctx.body = {
              ok: false,
              error: 'Browser not found'
            };
            return;
          }

          this.fleetManager.destroyBrowser(browserId);
          ctx.body = { ok: true };
        } catch (error) {
          logger.error('Failed to destroy browser via test endpoint', { error });
          ctx.status = 500;
          ctx.body = {
            ok: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          };
        }
      });
    }

    // Global discovery endpoints
    this.router.get('/json/version', async (ctx) => {
      const state = this.fleetManager.getState();
      ctx.body = this.buildVersionPayload(state);
    });

    this.router.get('/json/list', async (ctx) => {
      const state = this.fleetManager.getState();
      ctx.body = this.buildListPayload(state);
    });

    // Per-browser discovery endpoints
    this.router.get('/devtools/browser/:browserId/json/version', async (ctx) => {
      const { browserId } = ctx.params;
      const browser = this.fleetManager.getBrowser(browserId);
      
      if (!browser) {
        ctx.status = 404;
        ctx.body = { error: 'Browser not found' };
        return;
      }

      ctx.body = {
        Browser: 'Magi/1.0.0 Chrome/128.0.0.0',
        'Protocol-Version': '1.3',
        'User-Agent': 'Magi Browser Orchestrator',
        'V8-Version': '12.8.21',
        'WebKit-Version': '537.36 (@magi/orchestrator)',
        webSocketDebuggerUrl: browser.model?.endpoints.browserWSEndpoint ?? `ws://localhost:9222/devtools/browser/${browserId}`
      };
    });

    this.router.get('/devtools/browser/:browserId/json/list', async (ctx) => {
      const { browserId } = ctx.params;
      const browser = this.fleetManager.getBrowser(browserId);
      
      if (!browser) {
        ctx.status = 404;
        ctx.body = { error: 'Browser not found' };
        return;
      }

      const targets = [];
      for (const page of browser.pagesList) {
        const pageModel = browser.store.getPage(page.pageId);
        targets.push({
          id: page.pageId,
          type: 'page',
          url: pageModel?.url ?? 'about:blank',
          title: pageModel?.title ?? 'New Tab',
          attached: false,
          webSocketDebuggerUrl: page.wsEndpoint,
          faviconUrl: pageModel?.favicon ?? undefined
        });
      }

      ctx.body = targets;
    });

    this.router.get('/json/protocol', async (ctx) => {
      ctx.body = {
        version: {
          major: '1',
          minor: '3'
        },
        domains: [
          {
            domain: 'Target',
            experimental: false,
            types: [],
            commands: [
              { name: 'setDiscoverTargets', parameters: [{ name: 'discover', type: 'boolean' }] },
              { name: 'createTarget', parameters: [{ name: 'url', type: 'string' }], returns: [{ name: 'targetId', type: 'string' }] },
              { name: 'attachToTarget', parameters: [{ name: 'targetId', type: 'string' }, { name: 'flatten', type: 'boolean', optional: true }], returns: [{ name: 'sessionId', type: 'string' }] },
              { name: 'detachFromTarget', parameters: [{ name: 'sessionId', type: 'string' }] },
              { name: 'sendMessageToTarget', parameters: [{ name: 'message', type: 'string' }, { name: 'sessionId', type: 'string' }] },
              { name: 'getTargets', returns: [{ name: 'targetInfos', type: 'array' }] },
              { name: 'closeTarget', parameters: [{ name: 'targetId', type: 'string' }] },
              { name: 'getBrowserContexts', returns: [{ name: 'browserContextIds', type: 'array' }] },
              { name: 'createBrowserContext', returns: [{ name: 'browserContextId', type: 'string' }] },
              { name: 'disposeBrowserContext', parameters: [{ name: 'browserContextId', type: 'string' }] }
            ],
            events: [
              { name: 'targetCreated', parameters: [{ name: 'targetInfo', type: 'object' }] },
              { name: 'targetDestroyed', parameters: [{ name: 'targetId', type: 'string' }] },
              { name: 'attachedToTarget', parameters: [{ name: 'sessionId', type: 'string' }, { name: 'targetInfo', type: 'object' }, { name: 'waitingForDebugger', type: 'boolean' }] },
              { name: 'detachedFromTarget', parameters: [{ name: 'sessionId', type: 'string' }, { name: 'targetId', type: 'string' }] },
              { name: 'receivedMessageFromTarget', parameters: [{ name: 'sessionId', type: 'string' }, { name: 'message', type: 'string' }, { name: 'targetId', type: 'string' }] }
            ]
          },
          {
            domain: 'Browser',
            experimental: false,
            types: [],
            commands: [],
            events: []
          }
        ]
      };
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
      Browser: 'Magi/1.0.0 Chrome/128.0.0.0',
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
      noServer: true
    });

    // Handle WebSocket upgrade manually to support dynamic paths
    this.server.on('upgrade', (request, socket, head) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? ''}`);
      
      logger.info('[CDP-WS] Upgrade request received', {
        url: request.url,
        pathname: url.pathname,
        isDevtoolsPath: url.pathname.startsWith('/devtools/')
      });
      
      // Only handle /devtools/* paths
      if (url.pathname.startsWith('/devtools/')) {
        logger.info('[CDP-WS] Handling upgrade for devtools path', { pathname: url.pathname });
        this.wss?.handleUpgrade(request, socket, head, (ws) => {
          logger.info('[CDP-WS] Upgrade completed, emitting connection', { pathname: url.pathname });
          this.wss?.emit('connection', ws, request);
        });
      } else {
        logger.warn('[CDP-WS] Rejecting non-devtools path', { pathname: url.pathname });
        socket.destroy();
      }
    });

    this.wss.on('connection', async (ws, request) => {
      // Log ALL WebSocket connections for debugging
      logger.info('[CDP-WS] WebSocket connection event fired', {
        url: request.url,
        headers: request.headers
      });
      
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? ''}`);
      const [, , targetType, targetId] = url.pathname.split('/');
      
      logger.info('[CDP-WS] Connection URL parsed', {
        pathname: url.pathname,
        targetType,
        targetId,
        pathnameSplit: url.pathname.split('/')
      });

      // If targetType is 'browser' but no targetId, use first browser as default
      let effectiveBrowserId = targetId;
      if (targetType === 'browser' && !targetId) {
        const state = this.fleetManager.getState();
        effectiveBrowserId = state.browsers[0]?.browserId;
        logger.info('CDP client connecting to default browser', { browserId: effectiveBrowserId });
      }

      const client: WebSocketClient = {
        ws,
        browserId: targetType === 'browser' ? effectiveBrowserId : undefined,
        pageId: targetType === 'page' ? targetId : undefined
      };

      this.clients.add(client);

      logger.debug('[CDP-WS] WebSocket client registered', { 
        targetType, 
        targetId: effectiveBrowserId || targetId,
        browserId: client.browserId,
        pageId: client.pageId
      });

      // For page connections, attach to CDP session
      logger.debug('[CDP-WS] Checking page connection condition', {
        targetType,
        targetId,
        isPageType: targetType === 'page',
        hasTargetId: !!targetId,
        willEnterHandler: targetType === 'page' && !!targetId
      });
      
      if (targetType === 'page' && targetId) {
        logger.debug('[CDP] Page endpoint connection - START', { targetId });
        
        // Add WebSocket lifecycle logging
        logger.info('[CDP-WS] Page endpoint - Initial WebSocket state', {
          targetId,
          readyState: ws.readyState,
          stateNames: {
            0: 'CONNECTING',
            1: 'OPEN',
            2: 'CLOSING',
            3: 'CLOSED'
          }[ws.readyState]
        });
        
        ws.on('open', () => {
          logger.info('[CDP-WS] Page endpoint - WebSocket OPEN event', { targetId });
        });
        
        ws.on('close', (code, reason) => {
          logger.info('[CDP-WS] Page endpoint - WebSocket CLOSE event', {
            targetId,
            code,
            reason: reason.toString()
          });
        });
        
        ws.on('error', (error) => {
          logger.error('[CDP-WS] Page endpoint - WebSocket ERROR event', {
            targetId,
            error,
            message: error.message
          });
        });
        
        // CRITICAL FIX: Register message handler IMMEDIATELY to avoid race condition
        // Store messages in a buffer until CDP session is ready
        const messageBuffer: string[] = [];
        let sessionReady = false;
        let clientId: string | null = null;
        
        logger.info('[CDP-WS] Page endpoint - Registering message handler immediately', { targetId });
        
        ws.on('message', async (message) => {
          const msgStr = message.toString();
          logger.info('[CDP] Page endpoint - WebSocket message received (early handler)', {
            targetType,
            targetId,
            clientId,
            sessionReady,
            messagePreview: msgStr.substring(0, 200)
          });
          
          if (sessionReady && clientId) {
            // Session is ready, handle message immediately
            try {
              await this.sessionManager.handleClientMessage(targetId, clientId!, msgStr);
              logger.info('[CDP] Page endpoint - Message handled successfully', {
                targetId,
                clientId
              });
            } catch (error) {
              logger.error('[CDP] Page endpoint - Error handling message', {
                targetId,
                clientId,
                error,
                message: error instanceof Error ? error.message : 'Unknown error'
              });
            }
          } else {
            // Session not ready yet, buffer the message
            logger.info('[CDP] Page endpoint - Session not ready, buffering message', {
              targetId,
              bufferLength: messageBuffer.length + 1
            });
            messageBuffer.push(msgStr);
          }
        });
        
        const page = this.fleetManager.getPage(targetId);
        
        if (!page) {
          logger.error('[CDP] Page endpoint connection - Page NOT FOUND', { targetId });
          ws.close();
          return;
        }
        
        logger.debug('[CDP] Page endpoint connection - Page found', { 
          targetId, 
          pageId: page.pageId,
          hasWebContents: !!page.view?.webContents 
        });
        
        if (page) {
          // Wait for WebContents to be ready before attaching debugger
          const webContents = page.view.webContents;
          
          logger.debug('[CDP] Page endpoint - Checking WebContents state', {
            targetId,
            isDestroyed: webContents.isDestroyed(),
            isLoading: webContents.isLoading(),
            url: webContents.getURL()
          });
          
          // Check if WebContents is in a valid state
          if (webContents.isDestroyed()) {
            logger.error('[CDP] Page endpoint - WebContents is already destroyed', { targetId });
            ws.close();
            return;
          }

          // For pages that haven't started loading yet, give them time to start
          // This is especially important for non-activated pages created via CDP
          logger.debug('[CDP] Page endpoint - Waiting for WebContents to be ready for debugger', { 
            targetId, 
            isLoading: webContents.isLoading(),
            url: webContents.getURL() 
          });
          
          // Wait longer to ensure WebContents is fully initialized
          // Non-activated pages may need more time to set up
          logger.debug('[CDP] Page endpoint - Initial wait (500ms)', { targetId });
          await new Promise(resolve => setTimeout(resolve, 500));
          
          logger.debug('[CDP] Page endpoint - After initial wait', {
            targetId,
            isLoading: webContents.isLoading(),
            url: webContents.getURL()
          });
          
          // Now wait for any active loading to complete
          if (webContents.isLoading()) {
            logger.debug('[CDP] Page endpoint - WebContents is loading, waiting for completion', { targetId });
            await new Promise<void>((resolve) => {
              const onReady = () => {
                webContents.removeListener('did-finish-load', onReady);
                webContents.removeListener('did-fail-load', onReady);
                resolve();
              };
              webContents.once('did-finish-load', onReady);
              webContents.once('did-fail-load', onReady);
              
              // Timeout after 3 seconds
              setTimeout(() => {
                webContents.removeListener('did-finish-load', onReady);
                webContents.removeListener('did-fail-load', onReady);
                resolve();
              }, 3000);
            });
          }
          
          // Final delay to ensure everything is settled
          logger.debug('[CDP] Page endpoint - Final wait (200ms)', { targetId });
          await new Promise(resolve => setTimeout(resolve, 200));

          logger.debug('[CDP] Page endpoint - Ready to attach CDP session', { targetId });
          clientId = `${targetId}-${Date.now()}`;
          
          logger.info('[CDP-WS] Page endpoint - About to attach client', {
            targetId,
            clientId,
            wsReadyStateBefore: ws.readyState,
            wsReadyStateNameBefore: {
              0: 'CONNECTING',
              1: 'OPEN',
              2: 'CLOSING',
              3: 'CLOSED'
            }[ws.readyState]
          });
          
          await this.sessionManager.attachClient(
            targetId,
            webContents,
            clientId!,
            {
              send: (message: string) => {
                const currentState = ws.readyState;
                const stateName = {
                  0: 'CONNECTING',
                  1: 'OPEN',
                  2: 'CLOSING',
                  3: 'CLOSED'
                }[currentState];
                
                logger.info('[CDP-WS] Page endpoint - send callback invoked', {
                  targetId,
                  clientId,
                  wsReadyState: currentState,
                  wsReadyStateName: stateName,
                  wsOpen: currentState === WebSocket.OPEN,
                  messagePreview: message.substring(0, 200)
                });
                
                if (ws.readyState === WebSocket.OPEN) {
                  logger.info('[CDP-WS] Page endpoint - Sending message to WebSocket', {
                    targetId,
                    clientId,
                    messageLength: message.length
                  });
                  ws.send(message);
                  logger.info('[CDP-WS] Page endpoint - Message sent successfully', {
                    targetId,
                    clientId
                  });
                } else {
                  logger.warn('[CDP-WS] Page endpoint - WebSocket NOT OPEN, message dropped', {
                    targetId,
                    clientId,
                    wsReadyState: currentState,
                    wsReadyStateName: stateName,
                    messagePreview: message.substring(0, 200)
                  });
                }
              },
              close: () => {
                logger.info('[CDP-WS] Page endpoint - close callback invoked', {
                  targetId,
                  clientId,
                  wsReadyState: ws.readyState
                });
                ws.close();
              }
            }
          );
          
          logger.info('[CDP-WS] Page endpoint - Client attached successfully', {
            targetId,
            clientId,
            wsReadyStateAfter: ws.readyState,
            wsReadyStateNameAfter: {
              0: 'CONNECTING',
              1: 'OPEN',
              2: 'CLOSING',
              3: 'CLOSED'
            }[ws.readyState]
          });

          logger.debug('[CDP] Page endpoint - CDP session attached successfully', { targetId, clientId });

          // Mark session as ready and process buffered messages
          sessionReady = true;
          logger.info('[CDP] Page endpoint - Session ready, processing buffered messages', {
            targetId,
            clientId,
            bufferedCount: messageBuffer.length
          });
          
          // Process any buffered messages
          for (const bufferedMsg of messageBuffer) {
            logger.info('[CDP] Page endpoint - Processing buffered message', {
              targetId,
              clientId,
              messagePreview: bufferedMsg.substring(0, 200)
            });
            try {
              await this.sessionManager.handleClientMessage(targetId, clientId!, bufferedMsg);
            } catch (error) {
              logger.error('[CDP] Page endpoint - Error processing buffered message', {
                targetId,
                clientId,
                error
              });
            }
          }
          messageBuffer.length = 0; // Clear buffer

          ws.on('close', () => {
            logger.debug('[CDP] Page endpoint - Client disconnected', { targetType, targetId });
            sessionReady = false;
            this.sessionManager.detachClient(targetId, clientId!);
            this.clients.delete(client);
          });
        } else {
          logger.warn('[CDP] Page endpoint - Page not found for CDP connection', { pageId: targetId });
          ws.close();
          return;
        }
      } else if (targetType === 'browser' && effectiveBrowserId) {
        // For browser connections, implement Target.* API
        client.discoverTargets = false;
        client.attachedTargets = new Set();

        ws.on('message', (message) => {
          logger.debug('CDP message received (browser target)', {
            targetType,
            targetId: effectiveBrowserId,
            message: message.toString()
          });
          this.handleBrowserMessage(client, effectiveBrowserId, message.toString());
        });

        ws.on('close', () => {
          logger.debug('CDP client disconnected', { targetType, targetId });
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
      
      logger.debug('Handling browser CDP message', { 
        browserId, 
        method: msg.method, 
        id: msg.id,
        params: msg.params 
      });

      switch (msg.method) {
        case 'Browser.getVersion':
          this.handleBrowserGetVersion(client, browserId, msg);
          break;
        case 'Browser.setDownloadBehavior':
          this.handleBrowserSetDownloadBehavior(client, browserId, msg);
          break;
        case 'Target.getBrowserContexts':
          this.handleGetBrowserContexts(client, browserId, msg);
          break;
        case 'Target.createBrowserContext':
          this.handleCreateBrowserContext(client, browserId, msg);
          break;
        case 'Target.disposeBrowserContext':
          this.handleDisposeBrowserContext(client, browserId, msg);
          break;
        case 'Target.setDiscoverTargets':
          this.handleSetDiscoverTargets(client, browserId, msg);
          break;
        case 'Target.createTarget':
          this.handleCreateTarget(client, browserId, msg);
          break;
        case 'Target.closeTarget':
          this.handleCloseTarget(client, browserId, msg);
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
        case 'Target.getTargetInfo':
          this.handleGetTargetInfo(client, browserId, msg);
          break;
        case 'Target.setAutoAttach':
          this.handleSetAutoAttach(client, browserId, msg);
          break;
        default:
          // Check if this is a page-level command with sessionId (flattened target mode)
          // Playwright sends sessionId at top level in flatten mode, not in params
          const sessionId = (msg as any).sessionId || (msg.params as any)?.sessionId;
          if (sessionId) {
            // Extract targetId from sessionId (format: targetId-session-timestamp)
            const targetId = sessionId.split('-session-')[0];
            
            logger.debug('Forwarding page-level command to session', { 
              method: msg.method, 
              targetId, 
              sessionId,
              browserId
            });
            
            // Forward the entire message to the CDP session manager
            // The response will be sent back via the registered client callback
            // which wraps it in Target.receivedMessageFromTarget (in flatten mode)
            this.sessionManager.handleClientMessage(targetId, sessionId, message);
            
            // Do NOT send a response here - the CdpSessionManager will handle it
            // via the client callback registered in attachClient
          } else {
            logger.warn('Unhandled CDP method', { method: msg.method, browserId });
            this.sendResponse(client.ws, {
              id: msg.id,
              error: {
                code: -32601,
                message: `Method not found: ${msg.method}`
              }
            });
          }
      }
    } catch (error) {
      logger.error('Failed to parse CDP message', { error, message });
    }
  }

  private handleBrowserGetVersion(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    logger.debug('Browser.getVersion requested', { browserId });

    const state = this.fleetManager.getState();
    const versionInfo = this.buildVersionPayload(state);

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        protocolVersion: '1.3',
        product: versionInfo.Browser,
        revision: '@magi/orchestrator',
        userAgent: versionInfo['User-Agent'],
        jsVersion: versionInfo['V8-Version']
      }
    });
  }

  private handleBrowserSetDownloadBehavior(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const behavior = msg.params?.behavior as string;
    const downloadPath = msg.params?.downloadPath as string;
    const eventsEnabled = msg.params?.eventsEnabled as boolean;

    logger.debug('Browser.setDownloadBehavior', {
      browserId,
      behavior,
      downloadPath,
      eventsEnabled
    });

    // For now, just acknowledge the command
    // In the future, we could integrate with Electron's download handling
    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });
  }

  private handleGetBrowserContexts(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    logger.debug('Target.getBrowserContexts', { browserId });

    // In our implementation, each browser is a single context
    // We return the default context (empty array means default context)
    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        browserContextIds: []
      }
    });
  }

  private handleCreateBrowserContext(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    logger.debug('Target.createBrowserContext', { browserId });

    // For now, we don't support creating multiple browser contexts
    // Return the default browser context (using browserId as contextId)
    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        browserContextId: browserId
      }
    });
  }

  private handleDisposeBrowserContext(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const browserContextId = msg.params?.browserContextId as string;

    logger.debug('Target.disposeBrowserContext', { browserId, browserContextId });

    // For now, we don't actually dispose contexts
    // Just acknowledge the command
    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });
  }

  private handleGetTargetInfo(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    const targetId = msg.params?.targetId as string;

    logger.debug('Target.getTargetInfo', { browserId, targetId });

    // If no targetId specified, return info about the browser itself
    if (!targetId) {
      this.sendResponse(client.ws, {
        id: msg.id,
        result: {
          targetInfo: {
            targetId: browserId,
            type: 'browser',
            title: 'Magi Browser',
            url: '',
            attached: false,
            canAccessOpener: false
          }
        }
      });
      return;
    }

    // Otherwise, return info about the specific target
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

    const browser = this.fleetManager.getBrowser(browserId);
    const pageModel = browser?.store.getPage(targetId);

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        targetInfo: {
          targetId,
          type: 'page',
          title: pageModel?.title ?? 'New Tab',
          url: pageModel?.url ?? 'about:blank',
          attached: client.attachedTargets?.has(targetId) ?? false,
          canAccessOpener: false,
          browserContextId: browserId
        }
      }
    });
  }

  private handleCloseTarget(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    const targetId = msg.params?.targetId as string;

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

    logger.debug('Closing target', { browserId, targetId });

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

    // Close the page
    this.fleetManager.closePage({ browserId, pageId: targetId });

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        success: true
      }
    });

    // Notify discovery if enabled
    if (client.discoverTargets) {
      this.sendEvent(client.ws, {
        method: 'Target.targetDestroyed',
        params: {
          targetId
        }
      });
    }

    // Also clean up attached targets
    client.attachedTargets?.delete(targetId);
  }

  private handleSetDiscoverTargets(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const discover = msg.params?.discover as boolean;
    client.discoverTargets = discover;

    logger.debug('Target discovery toggled', { browserId, discover });

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

  private async handleCreateTarget(client: WebSocketClient, browserId: string, msg: CdpMessage) {
    const url = (msg.params?.url as string) ?? 'about:blank';

    logger.info('[CDP] handleCreateTarget - START', { 
      browserId, 
      url, 
      msgId: msg.id,
      autoAttachEnabled: client.autoAttach?.enabled,
      autoAttachFlatten: client.autoAttach?.flatten,
      autoAttachWaitForDebugger: client.autoAttach?.waitForDebuggerOnStart
    });

    const page = this.fleetManager.createPage({
      browserId,
      url,
      activate: false
    });

    if (!page) {
      logger.error('[CDP] handleCreateTarget - FAILED to create page', { browserId, url });
      this.sendResponse(client.ws, {
        id: msg.id,
        error: {
          code: -32000,
          message: 'Failed to create target'
        }
      });
      return;
    }

    logger.debug('[CDP] handleCreateTarget - Page created successfully', { 
      browserId, 
      pageId: page.pageId,
      url 
    });

    // Store the created page ID to ensure consistent targetId in events
    const createdPageId = page.pageId;

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        targetId: createdPageId
      }
    });

    // Note: Target.targetCreated event will be broadcast by BrowserFleetManager.createPage()
    // via broadcastTargetCreated() to all clients with discovery enabled.
    // This ensures consistent behavior and avoids duplicate events.

    // Auto-attach if enabled for this client
    if (client.autoAttach?.enabled) {
      logger.debug('[CDP] handleCreateTarget - Auto-attach enabled, attaching...', { 
        browserId, 
        targetId: createdPageId,
        flatten: client.autoAttach.flatten 
      });
      
      const sessionId = `${createdPageId}-session-${Date.now()}`;
      client.attachedTargets?.add(createdPageId);

      if (client.autoAttach.flatten) {
        // CRITICAL FIX: Attach CDP session FIRST, then send attachedToTarget event
        // This ensures the session is fully ready before Playwright tries to use it
        const webContents = page.view.webContents;
        
        logger.debug('[CDP] handleCreateTarget - Waiting for WebContents to be ready', { 
          targetId: createdPageId, 
          sessionId,
          isLoading: webContents.isLoading()
        });
        
        // Wait for WebContents to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (webContents.isLoading()) {
          logger.debug('[CDP] handleCreateTarget - WebContents is loading, waiting...', { 
            targetId: createdPageId 
          });
          await new Promise<void>((resolve) => {
            const onReady = () => {
              webContents.removeListener('did-finish-load', onReady);
              webContents.removeListener('did-fail-load', onReady);
              resolve();
            };
            webContents.once('did-finish-load', onReady);
            webContents.once('did-fail-load', onReady);
            
            // Timeout after 2 seconds
            setTimeout(() => {
              webContents.removeListener('did-finish-load', onReady);
              webContents.removeListener('did-fail-load', onReady);
              resolve();
            }, 2000);
          });
        }
        
        logger.debug('[CDP] handleCreateTarget - Attaching CDP session (AWAIT)', { 
          targetId: createdPageId, 
          sessionId 
        });
        
        // AWAIT the CDP session attachment to complete
        try {
          await this.sessionManager.attachClient(
            createdPageId,
            webContents,
            sessionId,
            {
              send: (message: string) => {
                // Wrap in Target.receivedMessageFromTarget
                this.sendEvent(client.ws, {
                  method: 'Target.receivedMessageFromTarget',
                  params: {
                    sessionId,
                    message,
                    targetId: createdPageId
                  }
                });
              },
              close: () => {
                logger.info('[CDP] CDP session closed', { sessionId, targetId: createdPageId });
              }
            }
          );
          
          logger.debug('[CDP] handleCreateTarget - CDP session attached successfully', { 
            targetId: createdPageId, 
            sessionId 
          });
        } catch (error) {
          logger.error('[CDP] handleCreateTarget - Failed to attach CDP session', {
            targetId: createdPageId,
            sessionId,
            error
          });
          return; // Don't send attachedToTarget if attachment failed
        }
      }

      // Send attachedToTarget event AFTER CDP session is ready
      const browser = this.fleetManager.getBrowser(browserId);
      const pageModel = browser?.store.getPage(createdPageId);
      this.sendEvent(client.ws, {
        method: 'Target.attachedToTarget',
        params: {
          sessionId,
          targetInfo: {
            targetId: createdPageId,
            type: 'page',
            title: pageModel?.title ?? 'New Tab',
            url: pageModel?.url ?? url,
            attached: true,
            canAccessOpener: false,
            browserContextId: browserId
          },
          waitingForDebugger: client.autoAttach.waitForDebuggerOnStart
        }
      });
      
      logger.debug('[CDP] handleCreateTarget - Sent Target.attachedToTarget event', {
        targetId: createdPageId,
        sessionId
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

    logger.debug('[CDP] handleAttachToTarget - START', { 
      browserId, 
      targetId, 
      flatten,
      msgId: msg.id 
    });

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

    // Send response immediately
    this.sendResponse(client.ws, {
      id: msg.id,
      result: {
        sessionId
      }
    });

    if (flatten) {
      // CRITICAL FIX: Attach CDP session FIRST, then send attachedToTarget event
      const webContents = page.view.webContents;
      
      logger.debug('[CDP] handleAttachToTarget - Waiting for WebContents to be ready', { 
        targetId, 
        sessionId,
        isLoading: webContents.isLoading()
      });
      
      // Wait for WebContents to be ready
      await new Promise(resolve => setTimeout(resolve, 100));
      
      if (webContents.isLoading()) {
        logger.debug('[CDP] handleAttachToTarget - WebContents is loading, waiting...', { 
          targetId 
        });
        await new Promise<void>((resolve) => {
          const onReady = () => {
            webContents.removeListener('did-finish-load', onReady);
            webContents.removeListener('did-fail-load', onReady);
            resolve();
          };
          webContents.once('did-finish-load', onReady);
          webContents.once('did-fail-load', onReady);
          
          // Timeout after 2 seconds
          setTimeout(() => {
            webContents.removeListener('did-finish-load', onReady);
            webContents.removeListener('did-fail-load', onReady);
            resolve();
          }, 2000);
        });
      }
      
      logger.debug('[CDP] handleAttachToTarget - Attaching CDP session (AWAIT)', { 
        targetId, 
        sessionId 
      });
      
      // AWAIT the CDP session attachment to complete
      try {
        await this.sessionManager.attachClient(targetId, webContents, sessionId, {
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
            logger.info('[CDP] CDP session closed', { sessionId, targetId });
          }
        });
        
        logger.debug('[CDP] handleAttachToTarget - CDP session attached successfully', { 
          targetId, 
          sessionId 
        });
      } catch (error) {
        logger.error('[CDP] handleAttachToTarget - Failed to attach CDP session', {
          targetId,
          sessionId,
          error
        });
        return; // Don't send attachedToTarget if attachment failed
      }
    }

    // Send attachedToTarget event AFTER CDP session is ready
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
    
    logger.debug('[CDP] handleAttachToTarget - Sent Target.attachedToTarget event', {
      targetId,
      sessionId
    });
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
    logger.debug('Detaching from target', { browserId, targetId, sessionId });

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

  private async handleSetAutoAttach(
    client: WebSocketClient,
    browserId: string,
    msg: CdpMessage
  ) {
    const autoAttach = msg.params?.autoAttach as boolean;
    const waitForDebuggerOnStart = (msg.params?.waitForDebuggerOnStart as boolean) ?? false;
    const flatten = (msg.params?.flatten as boolean) ?? true;

    logger.debug('Target.setAutoAttach', { 
      browserId, 
      autoAttach, 
      waitForDebuggerOnStart, 
      flatten 
    });

    // Store auto-attach configuration
    client.autoAttach = {
      enabled: autoAttach,
      waitForDebuggerOnStart,
      flatten
    };

    this.sendResponse(client.ws, {
      id: msg.id,
      result: {}
    });

    // If auto-attach is enabled, automatically attach to all existing targets
    if (autoAttach) {
      const browser = this.fleetManager.getBrowser(browserId);
      if (browser) {
        for (const page of browser.pagesList) {
          // Skip if already attached
          if (client.attachedTargets?.has(page.pageId)) {
            continue;
          }

          const sessionId = `${page.pageId}-session-${Date.now()}`;
          client.attachedTargets?.add(page.pageId);

          if (flatten) {
            // In flattened mode, attach the CDP session directly
            // Ensure WebContents is ready before attaching
            const webContents = page.view.webContents;
            if (webContents.isLoading()) {
              await new Promise<void>((resolve) => {
                const onReady = () => {
                  webContents.removeListener('did-finish-load', onReady);
                  webContents.removeListener('did-fail-load', onReady);
                  resolve();
                };
                webContents.once('did-finish-load', onReady);
                webContents.once('did-fail-load', onReady);
                setTimeout(() => {
                  webContents.removeListener('did-finish-load', onReady);
                  webContents.removeListener('did-fail-load', onReady);
                  resolve();
                }, 2000);
              });
            }
            
            // Add a small delay to ensure WebContents is fully ready for debugger
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await this.sessionManager.attachClient(
              page.pageId,
              webContents,
              sessionId,
              {
                send: (message: string) => {
                  // Wrap in Target.receivedMessageFromTarget
                  this.sendEvent(client.ws, {
                    method: 'Target.receivedMessageFromTarget',
                    params: {
                      sessionId,
                      message,
                      targetId: page.pageId
                    }
                  });
                },
                close: () => {
                  logger.info('CDP session closed', { sessionId, targetId: page.pageId });
                }
              }
            );
          }

          // Send attachedToTarget event
          const pageModel = browser.store.getPage(page.pageId);
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
              waitingForDebugger: waitForDebuggerOnStart
            }
          });
        }
      }
    }
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

  /**
   * Broadcast Target.targetCreated event to all browser-level clients with discovery enabled
   * Called when UI creates a new page
   */
  broadcastTargetCreated(
    browserId: string,
    pageInfo: {
      pageId: string;
      url: string;
      title: string;
    }
  ) {
    logger.debug('Broadcasting Target.targetCreated', { browserId, pageInfo });

    for (const client of this.clients) {
      // Only send to clients connected to this browser with discovery enabled
      if (client.browserId === browserId && client.discoverTargets) {
        this.sendEvent(client.ws, {
          method: 'Target.targetCreated',
          params: {
            targetInfo: {
              targetId: pageInfo.pageId,
              type: 'page',
              title: pageInfo.title,
              url: pageInfo.url,
              attached: client.attachedTargets?.has(pageInfo.pageId) ?? false,
              canAccessOpener: false,
              browserContextId: browserId
            }
          }
        });
      }
    }
  }

  /**
   * Broadcast Target.targetDestroyed event to all browser-level clients with discovery enabled
   * Called when UI closes a page
   */
  broadcastTargetDestroyed(browserId: string, pageId: string) {
    logger.debug('Broadcasting Target.targetDestroyed', { browserId, pageId });

    for (const client of this.clients) {
      // Only send to clients connected to this browser with discovery enabled
      if (client.browserId === browserId && client.discoverTargets) {
        this.sendEvent(client.ws, {
          method: 'Target.targetDestroyed',
          params: {
            targetId: pageId
          }
        });

        // Clean up attached targets
        client.attachedTargets?.delete(pageId);
      }
    }
  }
}
