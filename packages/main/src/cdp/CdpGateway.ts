import http from 'node:http';
import Koa from 'koa';
import Router from 'koa-router';
import WebSocket, { WebSocketServer } from 'ws';
import cors from '@koa/cors';
import { BrowserFleetManager } from '../fleet/BrowserFleetManager.js';
import type { BrowserFleetState } from '@magi/ipc-schema';
import { logger } from '../utils/logger.js';

export interface CdpGatewayOptions {
  host?: string;
  port?: number;
}

interface WebSocketClient {
  ws: WebSocket;
  browserId?: string;
  pageId?: string;
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

    this.wss.on('connection', (ws, request) => {
      const url = new URL(request.url ?? '', `http://${request.headers.host ?? ''}`);
      const [, , targetType, targetId] = url.pathname.split('/');

      const client: WebSocketClient = {
        ws,
        browserId: targetType === 'browser' ? targetId : undefined,
        pageId: targetType === 'page' ? targetId : undefined
      };

      this.clients.add(client);

      logger.info('CDP client connected', { targetType, targetId });

      ws.on('message', (message) => {
        logger.debug('CDP message received', {
          targetType,
          targetId,
          message: message.toString()
        });
        // TODO: Forward message to the corresponding Electron debugging session.
      });

      ws.on('close', () => {
        logger.info('CDP client disconnected', { targetType, targetId });
        this.clients.delete(client);
      });

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
