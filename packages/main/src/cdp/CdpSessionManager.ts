import { WebContents } from 'electron';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';

/**
 * CDP 消息格式
 */
interface CdpMessage {
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
  sessionId?: string;
}

/**
 * WebSocket 客户端信息
 */
interface CdpClient {
  id: string;
  send: (message: string) => void;
  close: () => void;
}

/**
 * 客户端回调接口
 */
interface ClientCallbacks {
  send: (message: string) => void;
  close: () => void;
}

/**
 * Debugger Session 信息
 */
interface DebuggerSession {
  webContents: WebContents;
  clients: Set<string>; // clientId set
  clientsMap: Map<string, CdpClient>; // clientId -> client
  attached: boolean;
  pendingMessages: Map<number, string>; // messageId -> clientId
}

/**
 * CdpSessionManager
 * 
 * 管理 Electron debugger sessions 和 CDP 消息路由
 * - 每个 pageId 对应一个 Electron debugger session
 * - 支持多个 CDP 客户端连接到同一个 page（消息多路复用）
 * - 处理 CDP 消息解析、路由和响应转发
 */
export class CdpSessionManager extends EventEmitter {
  private sessions: Map<string, DebuggerSession> = new Map();
  private messageIdCounter = 1;

  /**
   * 附加客户端到指定的 page
   */
  async attachClient(
    pageId: string,
    webContents: WebContents,
    clientId: string,
    callbacks: ClientCallbacks
  ): Promise<void> {
    let session = this.sessions.get(pageId);

    if (!session) {
      // 创建新的 debugger session
      session = {
        webContents,
        clients: new Set(),
        clientsMap: new Map(),
        attached: false,
        pendingMessages: new Map()
      };
      this.sessions.set(pageId, session);
    }

    // 创建客户端对象
    const client: CdpClient = {
      id: clientId,
      send: callbacks.send,
      close: callbacks.close
    };

    // 添加客户端
    session.clients.add(clientId);
    session.clientsMap.set(clientId, client);
    logger.debug(`CDP client ${clientId} attached to page ${pageId}, total clients: ${session.clients.size}`);

    // 如果 debugger 还未附加，则附加
    if (!session.attached && !webContents.isDestroyed()) {
      try {
        await webContents.debugger.attach('1.3');
        session.attached = true;
        logger.debug(`Debugger attached to page ${pageId}`);

        // 监听 debugger 消息
        const messageHandler = (
          _event: { preventDefault: () => void; readonly defaultPrevented: boolean },
          method: string,
          params: unknown,
          _sessionId: string
        ) => {
          this.handleDebuggerMessage(pageId, method, params);
        };

        webContents.debugger.on('message', messageHandler);

        // 监听 debugger 分离
        const detachHandler = (
          _event: { preventDefault: () => void; readonly defaultPrevented: boolean },
          reason: string
        ) => {
          logger.debug(`Debugger detached from page ${pageId}, reason: ${reason}`);
          session!.attached = false;
          webContents.debugger.removeListener('message', messageHandler);
          webContents.debugger.removeListener('detach', detachHandler);
        };

        webContents.debugger.on('detach', detachHandler);
      } catch (error) {
        logger.error(`Failed to attach debugger to page ${pageId}:`, error);
        throw error;
      }
    }
  }

  /**
   * 分离客户端
   */
  detachClient(pageId: string, clientId: string): void {
    const session = this.sessions.get(pageId);
    if (!session) {
      return;
    }

    session.clients.delete(clientId);
    session.clientsMap.delete(clientId);
    logger.debug(`CDP client ${clientId} detached from page ${pageId}, remaining clients: ${session.clients.size}`);

    // 如果没有客户端了，分离 debugger
    if (session.clients.size === 0 && session.attached) {
      try {
        if (!session.webContents.isDestroyed()) {
          session.webContents.debugger.detach();
        }
      } catch (error) {
        logger.error(`Failed to detach debugger from page ${pageId}:`, error);
      }
      this.sessions.delete(pageId);
      logger.debug(`Session for page ${pageId} removed`);
    }
  }

  /**
   * 处理来自客户端的 CDP 消息
   */
  async handleClientMessage(pageId: string, clientId: string, message: string): Promise<void> {
    logger.info('[CdpSessionManager] Received CDP message from client', {
      pageId,
      clientId,
      messagePreview: message.substring(0, 200)
    });

    const session = this.sessions.get(pageId);
    if (!session) {
      logger.error(`Session not found for page ${pageId}`);
      return;
    }

    const client = session.clientsMap.get(clientId);
    if (!client) {
      logger.error(`Client ${clientId} not found in session for page ${pageId}`);
      return;
    }

    let cdpMessage: CdpMessage;
    try {
      cdpMessage = JSON.parse(message);
    } catch (error) {
      logger.error(`Failed to parse CDP message from client ${clientId}:`, error);
      return;
    }

    const { id, method, params } = cdpMessage;

    logger.info('[CdpSessionManager] Parsed CDP message', {
      pageId,
      clientId,
      id,
      method,
      params
    });

    if (!method) {
      logger.error(`CDP message missing method field from client ${clientId}`);
      return;
    }

    // 记录消息 ID 和对应的客户端 ID，用于后续响应路由
    if (typeof id === 'number') {
      session.pendingMessages.set(id, clientId);
    }

    // 发送命令到 Electron debugger
    try {
      if (session.webContents.isDestroyed()) {
        throw new Error('WebContents is destroyed');
      }

      logger.info('[CdpSessionManager] Sending command to Electron debugger', {
        pageId,
        method,
        params
      });

      const result = await session.webContents.debugger.sendCommand(method, params);

      logger.info('[CdpSessionManager] Received result from Electron debugger', {
        pageId,
        method,
        id,
        result
      });

      // 发送响应回客户端
      if (typeof id === 'number') {
        const response: CdpMessage = { id, result };
        const responseStr = JSON.stringify(response);
        
        logger.info('[CdpSessionManager] Preparing to send response to client', {
          pageId,
          clientId,
          id,
          responseLength: responseStr.length,
          responsePreview: responseStr.substring(0, 200)
        });
        
        try {
          client.send(responseStr);
          logger.info('[CdpSessionManager] client.send() called successfully', {
            pageId,
            clientId,
            id
          });
        } catch (sendError) {
          logger.error('[CdpSessionManager] EXCEPTION during client.send()', {
            pageId,
            clientId,
            id,
            error: sendError,
            errorMessage: sendError instanceof Error ? sendError.message : 'Unknown'
          });
          throw sendError;
        }
        
        session.pendingMessages.delete(id);
        
        logger.info('[CdpSessionManager] Response sent successfully - completed', {
          pageId,
          clientId,
          id
        });
      }
    } catch (error) {
      logger.error(`[CdpSessionManager] Failed to send command ${method} to page ${pageId}:`, error);

      // 发送错误响应
      if (typeof id === 'number') {
        const errorResponse: CdpMessage = {
          id,
          error: {
            code: -32000,
            message: error instanceof Error ? error.message : 'Unknown error'
          }
        };
        
        logger.info('[CdpSessionManager] Sending error response to client', {
          pageId,
          clientId,
          id,
          error: errorResponse.error
        });
        
        try {
          client.send(JSON.stringify(errorResponse));
          logger.info('[CdpSessionManager] Error response sent successfully', {
            pageId,
            clientId,
            id
          });
        } catch (sendError) {
          logger.error('[CdpSessionManager] EXCEPTION during error response send', {
            pageId,
            clientId,
            id,
            sendError
          });
        }
        
        session.pendingMessages.delete(id);
      }
    }
  }

  /**
   * 处理来自 debugger 的事件消息（广播给所有客户端）
   */
  private handleDebuggerMessage(pageId: string, method: string, params: unknown): void {
    const session = this.sessions.get(pageId);
    if (!session) {
      return;
    }

    // 构造 CDP 事件消息（事件消息没有 id 字段）
    const eventMessage: CdpMessage = { method, params };
    const messageStr = JSON.stringify(eventMessage);

    // 广播给所有连接的客户端
    for (const clientId of session.clients) {
      const client = session.clientsMap.get(clientId);
      if (client) {
        try {
          client.send(messageStr);
        } catch (error) {
          logger.error(`Failed to send event ${method} to client ${clientId}:`, error);
        }
      }
    }

    // 发出内部事件，用于 UI 同步
    // 监听关键的页面事件来更新 UI 状态
    this.emit('cdp-event', {
      pageId,
      method,
      params
    });
  }

  /**
   * 获取指定 page 的客户端数量
   */
  getClientCount(pageId: string): number {
    const session = this.sessions.get(pageId);
    return session ? session.clients.size : 0;
  }

  /**
   * 清理所有 sessions
   */
  cleanup(): void {
    for (const [pageId, session] of this.sessions) {
      try {
        if (session.attached && !session.webContents.isDestroyed()) {
          session.webContents.debugger.detach();
        }
      } catch (error) {
        logger.error(`Failed to detach debugger from page ${pageId} during cleanup:`, error);
      }
    }
    this.sessions.clear();
    logger.debug('CdpSessionManager cleaned up');
  }
}
