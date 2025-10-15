# Magi Browser Orchestrator

Magi Browser Orchestrator is an Electron-based automation control center that manages multiple Chromium surfaces and exposes Chrome DevTools Protocol (CDP) compatible endpoints so Playwright, Puppeteer, and other CDP-aware clients can connect without modification. The project embraces Playwright terminology — `Browser`, `BrowserContext`, and `Page` — to keep the UI, orchestration layer, and external automation tooling aligned.

## Mission Objectives

- Deliver a desktop dashboard that visualizes every managed `Browser` with live thumbnails and an immersive detail view surfaced through a unified left sidebar navigation.
- Offer CDP discovery endpoints (`/json/version`, `/json/list`, `/json/protocol`) plus dedicated `browserWSEndpoint` and `pageWSEndpoint` addresses, enabling automation suites to connect to multiple browser instances concurrently.
- Normalize Electron’s automation primitives so clients operating in flattened target mode (Playwright, Puppeteer) receive Chromium-equivalent lifecycle semantics.
- Lay the foundation for future automation and AI assistant features (multi-model sidebars, workflow co-pilots) inspired by modern productivity sidebars and multi-space browsers [chromewebstore.google.com](https://chromewebstore.google.com/detail/deepsiderai-sidebar-deeps/dfbnddndcmilnhdfmmaolepiaefacnpo) [shift.com](https://shift.com/spaces/builder) [addons.mozilla.org](https://addons.mozilla.org/zh-CN/firefox/addon/geeksidebar/).

## Navigation & UI Language

- **Sidebar-first layout**: A persistent left sidebar provides access to `Browser`, `Automation`, `AI Assistant`, and upcoming modules. The `Browser` section is selected by default.
- **Visual consistency**: Sidebar and root background share a unified color palette, while feature zones use elevated cards for better hierarchy and readability, following contemporary sidebar patterns [ui.shadcn.org.cn](https://ui.shadcn.org.cn/view/sidebar-15) [ui.shadcn.org.cn](https://ui.shadcn.org.cn/view/sidebar-07).
- **Responsive composability**: The main content area adapts fluidly across desktop resolutions, keeping thumbnail grids and detail panels accessible alongside the sidebar.

## Feature Highlights

- **Multi-Browser Orchestration**: Spin up dozens of isolated `Browser` instances via `BrowserView` + `session.fromPartition`, centrally managed by `BrowserFleetManager`.
- **Per-Browser CDP Endpoints**: Each `Browser` exposes a dedicated `browserWSEndpoint` (e.g., `ws://localhost:9222/devtools/browser/<browserId>`), ensuring automation clients can attach simultaneously to multiple instances without session collisions.
- **Context Isolation**: Lightweight `BrowserContext` creation for separate user journeys, protecting cookies and local storage while enabling parallel user flows.
- **Realtime Dashboard & Detail Views**: Live thumbnails, rich metadata, and a full browser-like shell (tabs, navigation controls, downloads, DevTools toggles) per `Browser`.
- **Automation & AI Workbench (Planned)**: Upcoming sections in the sidebar will host workflow automation scripts and AI copilots, drawing on the multi-model integration patterns popularized by modern AI sidebars [chromewebstore.google.com](https://chromewebstore.google.com/detail/deepsiderai-sidebar-deeps/dfbnddndcmilnhdfmmaolepiaefacnpo) [addons.mozilla.org](https://addons.mozilla.org/zh-CN/firefox/addon/geeksidebar/).

## Technology Stack

- Desktop shell: Electron 31 (Chromium 128) with `BrowserWindow` + `BrowserView`.
- Renderer UI: React 18 + Vite + Mantine (component framework) layered with Tailwind CSS utilities.
- State management: Zustand in renderer, typed event contracts via `@magi/ipc-schema`.
- Main-process services: Node.js 20 + TypeScript, packaged with `electron-builder`.
- Automation compatibility: Playwright 1.48+ (flattened target mode) and Puppeteer 23+.

## IA & Navigation Model

```
┌───────────────────────────────┐
│ Sidebar (same background)     │
│ ─ Browser (default active)    │
│ ─ Automation (coming soon)    │
│ ─ AI Assistant (coming soon)  │
│ ─ Settings                    │
└───────────────▲───────────────┘
                │
                │
┌───────────────┴────────────────┐
│ Dashboard / Detail Content     │
│ (card-based sections,          │
│ thumbnail grid, panels)        │
└────────────────────────────────┘
```

- The sidebar uses the same background hue as the application root, while content panels inside each section render on card surfaces with subtle elevation.
- Section switches preserve browser processes; only view bindings change.
- Future modules (Automation, AI Assistant) will live alongside `Browser`, enabling users to launch scripts or trigger AI workflows without leaving the unified interface [shift.com](https://shift.com/spaces/builder).

## Architecture Overview

### `MainWindow`
An Electron `BrowserWindow` that hosts the renderer UI. It adds/removes `BrowserView` instances to match the current navigation state (`dashboard` vs `browser/<browserId>/<pageId>` routes) and keeps their z-order aligned with sidebar interactions.

### `BrowserFleetManager`
A singleton orchestrator maintaining:

- `browsers: Map<browserId, ManagedBrowser>`
- `contexts: Map<browserContextId, Electron.Session>`
- `pages: Map<pageId, ManagedPage>`

It resolves lifecycle commands (`createBrowser`, `createPage`, `closePage`, `destroyBrowser`) and mirrors them into CDP `Target.*` semantics (flattened mode compatible).

### `ManagedBrowser`
Represents a Playwright `Browser`:

- `browserId`: UUID, surfaced as CDP `targetId`.
- `browserWSEndpoint`: Dedicated endpoint published in discovery APIs.
- `view`: Primary `BrowserView` containing the active `Page`.
- `context`: Electron `Session`.
- `pages`: Ordered list of `ManagedPage` records with one marked active.

### `ManagedPage`
Maps to a Playwright `Page`:

- `pageId`: CDP `targetId`.
- `view`: Dedicated `BrowserView` reused when foregrounded.
- `sessionId`: Current CDP session assigned to attached clients.
- `navigationState`, `downloadState`, and `thumbnailState`: Structures synchronized to renderer.

### IPC Bus
Renderer ↔ main-process communication uses structured IPC channels built on Electron’s `ipcMain.handle` / `ipcRenderer.invoke` pairs. Commands include `browser:create`, `page:navigate`, `page:select`, `page:close`, and `download:cancel`.

## CDP Gateway Design

- Discovery endpoints: `/json/version`, `/json/list`, `/json/protocol` served via an embedded Koa server, mapping internal state to Chrome-compatible payloads.
- WebSocket routing:
  - `ws://localhost:9222/devtools/browser/<browserId>` → attaches to the `ManagedBrowser`, enabling automation clients to issue high-level commands and discover contexts/pages.
  - `ws://localhost:9222/devtools/page/<pageId>` → attaches directly to a `ManagedPage`.
- Flattened target support: Implements `Target.setDiscoverTargets`, `Target.createTarget`, `Target.attachToTarget`, and `Target.sendMessageToTarget` normalized for Playwright.
- Multiplexed sessions: A router layer fans in/out CDP messages so multiple automation clients can concurrently connect to separate browser targets.

## UI Behavior

### Dashboard
- Grid of browser cards (card backgrounds) displaying thumbnail, title, URL, status, and quick actions.
- Cards sit within a content panel that inherits the app background, visually separated by card elevation.
- Thumbnail updates run on a throttled schedule via `ThumbnailScheduler`.

### Browser Detail
- Mantine `Tabs` mirror backend `ManagedPage` order, shown inside a card container.
- Address bar, navigation controls, and downloads panel align in a card header/body pattern.
- Sidebar remains visible; the active sidebar item highlights the current module.

### Layout & Responsiveness
- Each tab hosts a `div.browser-host` whose bounds dictate the associated `BrowserView` rectangle.
- `ResizeObserver` emits `layout:update` IPC events to keep `BrowserView` geometry accurate.
- High-DPI monitors are handled by factoring in `screen.getPrimaryDisplay().scaleFactor`.

## Automation & AI Roadmap

- **Automation module**: Script library, schedule manager, and workflow builder accessible from the sidebar. Integrates with Playwright/Puppeteer recipes to orchestrate multi-browser runs.
- **AI assistant module**: Context-aware copilot that surfaces automation suggestions, summarizes sessions, or triggers inline assistance, following the multi-model sidebar pattern seen in current productivity extensions [chromewebstore.google.com](https://chromewebstore.google.com/detail/deepsiderai-sidebar-deeps/dfbnddndcmilnhdfmmaolepiaefacnpo) [addons.mozilla.org](https://addons.mozilla.org/zh-CN/firefox/addon/geeksidebar/).
- **Spaces & context switching**: Optional “Spaces” system to group browsers, automation flows, and AI tools per project, inspired by multi-space browser workspaces [shift.com](https://shift.com/spaces/builder).

## Messaging Contracts

```
type BrowserAction =
  | { type: 'browser:create'; payload: CreateBrowserOptions }
  | { type: 'browser:destroy'; browserId: string }
  | { type: 'page:navigate'; browserId: string; pageId: string; url: string }
  | { type: 'page:select'; browserId: string; pageId: string }
  | { type: 'page:close'; browserId: string; pageId: string };
```

Main-process responses stream through `browser:state` updates and focused event channels (`page:updated`, `download:progress`, `browser:endpointChanged`).

## Implementation Roadmap

1. **Core Fleet Manager**
   - Finalize `ManagedBrowser`/`ManagedPage` models and persistence via `@magi/shared-state`.
   - Ensure `browserWSEndpoint` lifecycle is consistent across create/destroy operations.

2. **CDP Facade**
   - Implement discovery server and WebSocket routing with per-browser multiplexing.
   - Overcome Electron’s single debugger limitation through session fan-out.

3. **Renderer Application**
   - Build the sidebar layout with Mantine components styled to the shared background requirements.
   - Implement dashboard/detail cards and responsive thumbnail grid.

4. **Automation & AI Modules**
   - Stub sidebar entries and data flows for future automation and AI surfaces.
   - Prototype AI assistant embedding using multi-model connectors inspired by modern sidebars [chromewebstore.google.com](https://chromewebstore.google.com/detail/deepsiderai-sidebar-deeps/dfbnddndcmilnhdfmmaolepiaefacnpo) [addons.mozilla.org](https://addons.mozilla.org/zh-CN/firefox/addon/geeksidebar/).

5. **Testing**
   - Unit tests for lifecycle commands and CDP target translation.
   - Playwright integration tests validating `connectOverCDP` against multiple `browserWSEndpoint` targets.
   - Visual regression snapshots for sidebar, dashboard cards, and detail layouts.

## Getting Started

### Prerequisites
- Node.js ≥ 20
- pnpm ≥ 9 (recommended)

### Installation

```
git clone https://github.com/your-repo/magi-browser.git
cd magi-browser
pnpm install
pnpm dev
```

The Electron shell launches alongside the CDP server (default `http://localhost:9222`).

## Playwright Example: Multi-Browser Attachment

```
import { chromium } from 'playwright';

(async () => {
  // Query /json/list to find browserWSEndpoint values
  const browser = await chromium.connectOverCDP('http://localhost:9222/devtools/browser/<browserId>');
  const context = browser.contexts()[0] ?? await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.electronjs.org');
  await page.close();
  await browser.close();
})();
```

Clients can repeat this flow for additional `browserId` values to orchestrate multiple browser instances in parallel.

## Contributing

- Keep terminology aligned with Playwright concepts and sidebar-first UX requirements.
- Document new CDP domains or Electron shims inline, referencing the adapter strategy above.
- Ensure IPC contracts remain typed and map closely to CDP events.
- Validate multi-endpoint automation scenarios in CI to guarantee simultaneous automation clients remain stable.

With the sidebar-led design, dedicated `browserWSEndpoint` architecture, and upcoming automation/AI modules, Magi Browser Orchestrator becomes a unified productivity hub that combines Electron rendering, Chromium-grade CDP ergonomics, and modern multi-workspace inspirations.