# Magi Browser Orchestrator 技术说明

## 1. 项目概览

Magi Browser Orchestrator 是一款基于 Electron 的多浏览器编排控制中心，通过统一的桌面界面与 CDP（Chrome DevTools Protocol）网关管理多实例 Chromium 表面，并向 Playwright、Puppeteer 等自动化客户端提供兼容的调试端点。核心目标包括：

- 同时管理多个 `Browser` / `BrowserContext` / `Page`，提供实时缩略图、详细视图和生命周期控制。
- 暴露 `/json/version`、`/json/list`、`/json/protocol` 以及特定的 `browserWSEndpoint`、`pageWSEndpoint`，供多自动化客户端并发接入。
- 在 Electron 环境中复刻 Playwright/Chromium 式目标管理语义，为后续自动化脚本和 AI 助手铺垫。

### 技术栈

| 层级 | 技术 | 说明 |
| ---- | ---- | ---- |
| Desktop Shell | Electron 31 (Chromium 128) | 提供主窗口、BrowserView 容器与主进程服务 |
| Renderer UI | （待实现）React 18 + Vite + Mantine + Tailwind | 负责侧边栏、仪表盘与详情页 |
| 主进程服务 | Node.js 20 + TypeScript + electron-vite | 承担 BrowserFleet 管理、CDP 网关、IPC |
| 共享层 | Zod + TypeScript | 共享消息契约（`@magi/ipc-schema`）与状态模型（`@magi/shared-state`） |
| 包管理 | pnpm workspace | 统一管理主/渲染/共享子包 |

---

## 2. 架构设计

### 2.1 顶层模块

```
┌──────────────────────────────────────────────┐
│ Electron Main Process                        │
│  ├─ MainWindow (BrowserWindow + BrowserViews)│
│  ├─ BrowserFleetManager                      │
│  │   ├─ ManagedBrowser                       │
│  │   │   └─ ManagedPage (BrowserView)        │
│  ├─ CdpGateway (Koa + WS)                    │
│  └─ IPC 注册器 (ipcMain.handle/send)         │
├──────────────────────────────────────────────┤
│ Renderer (待开发): React + Mantine/Tailwind  │
│  ├─ Sidebar / Dashboard / Browser Detail     │
│  ├─ Zustand Store (订阅 browser:state)       │
│  └─ IPC Client (window.magiApi)              │
├──────────────────────────────────────────────┤
│ Shared Packages                              │
│  ├─ @magi/ipc-schema（Zod 契约）             │
│  └─ @magi/shared-state（状态模型与 store）   │
└──────────────────────────────────────────────┘
```

### 2.2 主进程职责

| 组件 | 功能概要 | 重点实现 |
| ---- | -------- | -------- |
| `MainWindow` (`packages/main/src/app/MainWindow.ts`) | 创建 BrowserWindow、预加载脚本、外链处理、生产模式扩展加载 | 使用 hiddenInset 标题栏、统一背景色 |
| `BrowserFleetManager` (`/fleet/BrowserFleetManager.ts`) | 管理所有 ManagedBrowser/ManagedPage 的生命周期；决定当前附着的 BrowserView；广播状态 | 通过 `BrowserFleetStateStore` 维护状态，触发 `state` 事件 |
| `ManagedBrowser` (`/fleet/ManagedBrowser.ts`) | 映射 Playwright Browser，生成 Electron Session、维护页签集合 | 提供 `createPage`、`setActivePage`、`removePage`、`setBounds` 等 |
| `ManagedPage` (`/fleet/ManagedPage.ts`) | 对应 Playwright Page，封装 BrowserView、监听导航与 favicon/标题等事件 | 同步状态到 store，支持 `navigate`、`reload`、`goBack/Forward` |
| `CdpGateway` (`/cdp/CdpGateway.ts`) | 通过 Koa + WebSocket 暴露 CDP 发现接口与 ws 路由 | 当前完成 discovery API 雏形，消息转发待补全 |
| `registerHandlers` (`/ipc/registerHandlers.ts`) | 使用 zod 验证的 IPC 命令处理器，桥接 renderer action 与 fleet manager | 支持 `browser:create/destroy`、`page:*` 操作 |

### 2.3 共享层

- `@magi/ipc-schema`：使用 Zod 定义 `BrowserAction`, `ManagedBrowser`, `ManagedPage`, 各类事件与状态结构，确保主/渲染进程通信类型一致。
- `@magi/shared-state`：提供 `BrowserFleetStateStore`、`createManagedBrowser/Page` 等工具，用于主进程维护可序列化状态快照。

### 2.4 渲染层（规划中）

- React + Vite（electron-vite renderer pipeline）
- Mantine + Tailwind 提供侧边栏、卡片式 UI，与 README 中的设计语言保持一致。
- Zustand 存储主进程推送的 `browser:state`，驱动 Dashboard 和 Detail 页面。
- `window.magiApi`（预加载暴露）封装 IPC 调用和事件订阅。

### 2.5 CDP 网关

- Koa 路由 `/json/version`、`/json/list`、`/json/protocol` 映射主进程状态。
- `WebSocketServer` 监听 `/devtools/browser/<browserId>` 与 `/devtools/page/<pageId>`。
- 当前阶段实现连接登记与日志，后续需补充 Electron debugger session 扇出、Target.* API 适配。

---

## 3. 当前进展

| 模块 | 进度 | 说明 |
| ---- | ---- | ---- |
| 项目骨架 | ✅ | root `package.json`、`pnpm-workspace.yaml`、`.gitignore`、`tsconfig.base.json` 等已配置 |
| pnpm 依赖 | ✅ | 已安装 Electron 31、electron-vite 4、Koa、ws、Zod 等依赖及类型声明 |
| 共享契约与状态 | ✅ | `packages/shared/ipc-schema`, `packages/shared/shared-state` 完成，导出完整 schema/type |
| 主进程核心 | ✅ | `MainWindow`, `BrowserFleetManager`, `ManagedBrowser`, `ManagedPage`, `CdpGateway`, `registerHandlers`, `preload`, `logger` 等已实现 |
| 预加载/IPC | ✅ | `contextBridge` 暴露 `magiApi`（action invoke、state 订阅、自定义事件） |
| 测试/构建脚本 | ⏳ | package scripts 已定义，但尚未编写具体测试或运行验证 |
| 渲染层 | ⏳ | 目录已搭建（`packages/renderer/src/...`），尚未实现 React 代码与状态管理 |
| 缩略图调度 | ⏳ | `ThumbnailScheduler` 规划中，当前主进程未定期 capturePage |
| CDP 消息转发 | ⏳ | 仅实现 discovery 路由与 WebSocket 框架，尚未接入 Electron debugger 扇出 |
| 文档 | ✅ | 本技术说明文档 |

---

## 4. 后续工作计划

### 4.1 渲染层实现（高优先级）

- 初始化 Vite + React + Mantine + Tailwind 配置。
- 构建侧边栏、Dashboard、Browser Detail、Settings、占位模块。
- Zustand store 订阅 `browser:state`，实现浏览器卡片列表、标签页切换、导航栏。

### 4.2 主进程补强

- `ThumbnailScheduler`：定期调用 `BrowserView.webContents.capturePage` 并推送 base64 缩略图。
- CDP 代理：实现 Electron `debugger` session 管理，转发 `Target.*`、`Runtime.*` 等消息，支持多客户端扇出。
- BrowserFleetManager 优化：处理窗口尺寸变化（`ResizeObserver` -> IPC -> `updateContentBounds`），完善浏览器统计信息维护。

### 4.3 自动化与测试

- 单元测试：使用 Vitest 覆盖 `BrowserFleetStateStore`, `ManagedBrowser/Page` 逻辑。
- 集成测试：配置 Playwright，利用 `connectOverCDP` 验证多浏览器端点。
- 脚本：`pnpm dev`（并行 renderer/main）、`pnpm build`（electron-builder）、`pnpm test`（unit + integration）。

### 4.4 未来模块

- Automation 模块：侧边栏入口、自动化脚本管理、调度器占位。
- AI Assistant 模块：集成多模型连接器，响应会话上下文。
- Spaces/Workspace：为不同项目隔离浏览器、自动化流程与 AI 工具。

---

## 5. 附录

### 5.1 目录结构概览

```
Magi/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── packages/
│   ├── main/
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── preload.ts
│   │   │   ├── app/MainWindow.ts
│   │   │   ├── cdp/CdpGateway.ts
│   │   │   ├── fleet/{BrowserFleetManager, ManagedBrowser, ManagedPage}.ts
│   │   │   ├── ipc/registerHandlers.ts
│   │   │   └── utils/logger.ts
│   ├── renderer/                  # 待实现的 React 渲染层
│   └── shared/
│       ├── ipc-schema/            # Zod 契约
│       └── shared-state/          # 状态模型与 store
└── docs/
    └── architecture.md            # 本文档
```

### 5.2 关键依赖

- Electron 31.x
- electron-vite 4.x
- Koa 2.x, koa-router 13.x, ws 8.x
- Zod 3.x
- Mantine, Tailwind（待引入至渲染层）
- pnpm workspace 9.x

---

如需进一步细化某个模块或输出其他形式文档（如设计图、流程图、API 参考），请告知下一步需求。
