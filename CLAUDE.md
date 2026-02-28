# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

UI-TARS Desktop is a GUI automation agent that takes natural language instructions, captures screenshots, sends them to a Vision-Language Model (VLM), parses predicted actions, and executes them on the user's computer or browser. The app name in configs is `heyworkly-desktop`.

## Common Commands

### Development
```bash
pnpm install                  # Install all dependencies (use pnpm, not npm)
pnpm dev:ui-tars              # Start Electron dev server (via Turbo)
```

From `apps/ui-tars/`:
```bash
npm run dev                   # Start Electron dev with HMR (renderer only)
npm run dev:w                 # Dev with main process watch (restarts on main changes)
npm run debug                 # Dev with source maps + Chrome DevTools debugging (port 9222)
```

### Building
```bash
# From apps/ui-tars/:
npm run build:deps            # Build all workspace dependencies first
npm run build:dist            # Build Electron app (production)
npm run build                 # Full pipeline: clean → typecheck → build → make installer
npm run package               # Package with Electron Forge (no installer)
```

### Testing
```bash
pnpm test                     # Run all workspace unit tests (Vitest)
pnpm test -- --run <pattern>  # Run a single test file by name

# From apps/ui-tars/:
npm run test                  # App-level unit tests
npm run test:e2e              # Playwright E2E tests (requires build:e2e first)
npm run build:e2e && npm run test:e2e  # Full E2E pipeline
```

### Linting & Type Checking
```bash
pnpm lint                     # ESLint across entire monorepo
pnpm format                   # Prettier across entire monorepo

# From apps/ui-tars/:
npm run typecheck             # Type-check both Node and Web targets
npm run typecheck:node        # Type-check main/preload only (tsconfig.node.json)
npm run typecheck:web         # Type-check renderer only (tsconfig.web.json)
```

### Commit Conventions
Commits are validated by commitlint. Format: `type(scope): message`
Valid types: `feat`, `fix`, `docs`, `chore`, `refactor`, `ci`, `test`, `revert`, `perf`, `release`, `style`, `tweak`

## Architecture

### Monorepo Structure (pnpm workspaces + Turbo)

- **`apps/ui-tars/`** — Main Electron desktop application
- **`packages/ui-tars/sdk/`** — Platform-agnostic GUIAgent framework (published to npm as `@ui-tars/sdk`)
- **`packages/ui-tars/shared/`** — Shared types, constants, enums (`@ui-tars/shared`)
- **`packages/ui-tars/action-parser/`** — Parses VLM prediction strings into structured actions (`@ui-tars/action-parser`)
- **`packages/ui-tars/electron-ipc/`** — Type-safe IPC layer between Electron main/renderer (`@ui-tars/electron-ipc`)
- **`packages/ui-tars/operators/`** — Operator implementations (nut-js, browser-operator, adb, browserbase)
- **`packages/ui-tars/cli/`** — CLI interface (`@ui-tars/cli`)
- **`packages/agent-infra/`** — Infrastructure packages (MCP server, browser utils, logger)
- **`packages/common/`** — Shared build configs

### Electron App Layers (`apps/ui-tars/src/`)

**Main process** (`src/main/`):
- `main.ts` — App entry, window creation, permissions setup
- `ipcRoutes/` — IPC handlers: agent, screen, window, permission, setting, browser, remoteResource
- `services/runAgent.ts` — Core orchestration: creates operator + GUIAgent, manages the agent loop
- `agent/` — Local operator wrappers (NutJSElectronOperator, webviewOperator) and system prompts
- `remote/` — Remote operator factories, proxy client, auth
- `store/` — Zustand store (main process is source of truth)

**Renderer** (`src/renderer/src/`):
- `api.ts` — Type-safe IPC client (auto-typed from `Router` type exported by main)
- `pages/` — Routes: home, local, remote, settings, widget
- `components/Workspace/` — Main agent execution UI (WorkspacePanel, BrowserView, StepsTimeline, etc.)
- Subscribes to main process Zustand store via `zustandBridge` (exposed through preload)

**Preload** (`src/preload/`):
- Bridges main↔renderer: exposes `ipcRenderer.invoke`, `zustandBridge`, `setting`, `platform`

### The Agent Loop (core data flow)

```
User instruction → GUIAgent.run() loop:
  1. operator.screenshot() → captures screen as base64
  2. model.invoke() → sends last 5 screenshots + conversation to VLM
  3. actionParser.parse() → converts prediction string to structured actions
  4. operator.execute() → performs action (click, type, drag, scroll, hotkey)
  5. Emit onData callback → UI updates with new conversation turn
  6. Repeat until: finished action, error, max loops (100), or user stop
```

### Operator Pattern

All operators implement the abstract `Operator` interface with two methods: `screenshot()` and `execute()`.

| Operator | Location | Purpose |
|----------|----------|---------|
| NutJSOperator | `packages/ui-tars/operators/nut-js/` | Local computer control via nut.js |
| NutJSElectronOperator | `apps/ui-tars/src/main/agent/operator.ts` | Electron wrapper around NutJSOperator |
| BrowserOperator | `packages/ui-tars/operators/browser-operator/` | Browser DOM control via Playwright/Puppeteer |
| RemoteComputerOperator | `apps/ui-tars/src/main/remote/operators.ts` | Proxies to remote server |
| RemoteBrowserOperator | `apps/ui-tars/src/main/remote/operators.ts` | Proxies browser control to remote server |

### IPC Communication

Uses a custom type-safe IPC layer (`@ui-tars/electron-ipc`) inspired by tRPC:
- **Main**: Routes defined with `t.procedure.input<Type>().handle(async (input) => ...)` in `src/main/ipcRoutes/`
- **Renderer**: Client created with `createClient<Router>()` in `src/renderer/src/api.ts` — calls are fully typed
- The `Router` type is exported from main and imported by renderer for end-to-end type safety

### State Management

- **Main process**: Zustand store (`src/main/store/`) is the single source of truth for agent state
- **Renderer**: Subscribes via `zustandBridge` (preload-exposed). No duplicate state — renderer reads from main
- **Settings persistence**: `electron-store` saves settings to disk (`src/main/store/setting.ts`)

### Path Aliases (in tsconfig)

- `@/*` → `./src/*`
- `@shared/*` → `./src/shared/*`
- `@main/*` → `./src/main/*`
- `@renderer/*` → `./src/renderer/src/*`
- `@resources/*` → `./resources/*`

## Key Technical Details

- **Node.js ≥ 20** required
- **pnpm 9.10.0** — uses `shamefully-hoist=true` and `node-linker=hoisted` (see `.npmrc`)
- **Two TypeScript configs** for the app: `tsconfig.node.json` (main/preload) and `tsconfig.web.json` (renderer)
- **Electron Vite** handles bundling with separate configs for main, preload, and renderer
- **Electron Forge** handles packaging and distribution (DMG on macOS, Squirrel on Windows)
- **Platform-specific native deps**: `@computer-use/libnut-darwin` / `libnut-win32` / `libnut-linux` are conditionally included
- **VLM config**: Provider, base URL, API key, and model name are set via settings UI or `.env` file (see `.env.example`)
- **Image processing**: VLM screenshots are resized based on model version (v1.0 vs v1.5) with different max pixel limits
- **Max 5 screenshots** are sent to the model per invocation (constant `MAX_IMAGE_LENGTH` in shared)
- **Prettier**: single quotes, trailing commas, 2-space indent, no tabs
