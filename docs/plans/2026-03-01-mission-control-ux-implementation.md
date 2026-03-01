# Mission Control UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the heyworkly desktop app UI/UX from a single-agent timeline view into a Mission Control experience — single-input home page, window-to-widget morphing, magic cursor with visual effects, plan progress tracking, and rich results view.

**Architecture:** The main Electron BrowserWindow morphs into a compact floating widget during execution. A separate transparent overlay BrowserWindow renders the magic cursor. The existing ScreenMarker's waterflow gets reactive glow states. All orchestrator events flow through the existing zustandBridge (store.setState → IPC → renderer) — no new IPC channels needed. The renderer conditionally renders new vs legacy UI based on `multiAgentEnabled` setting.

**Tech Stack:** React 18, React Router 7 (HashRouter), Tailwind CSS 4, Radix UI, Zustand, Electron BrowserWindow API, CSS animations, Lucide icons, Sonner toasts

**Design Doc:** `docs/plans/2026-03-01-multi-agent-ux-design.md`

---

## Phase 1: State & Data Foundation

### Task 1: Extend AppState with orchestrator fields

**Files:**
- Modify: `apps/ui-tars/src/main/store/types.ts:25-38`

**Step 1: Add orchestrator types and extend AppState**

Add the following types and fields to `types.ts`:

```typescript
// Add after the NextAction type (after line 23)

export interface OrchestratorPlanStep {
  id: number;
  agent: 'browser' | 'desktop' | 'api';
  task: string;
  depends_on: number[];
}

export interface OrchestratorStepResult {
  stepId: number;
  success: boolean;
  result?: string;
  error?: string;
  retries: number;
  startTime?: number;
  endTime?: number;
}

export interface OrchestratorToolCall {
  stepId: number;
  toolName: string;
  args: Record<string, unknown>;
  status: 'pending' | 'success' | 'error';
  result?: string;
  timestamp: number;
}

export interface CursorState {
  x: number;
  y: number;
  action: string;
  visible: boolean;
}

// Add these fields to AppState type:
// orchestratorPlan, orchestratorActiveStep, orchestratorStepResults,
// orchestratorToolCalls, orchestratorCursor, orchestratorPhase,
// orchestratorStartTime
```

Now modify the `AppState` type to add the new fields after the existing ones:

```typescript
export type AppState = {
  // ... existing fields stay unchanged ...
  theme: 'dark' | 'light';
  ensurePermissions: { screenCapture?: boolean; accessibility?: boolean };
  instructions: string | null;
  restUserData: Omit<GUIAgentData, 'status' | 'conversations'> | null;
  status: GUIAgentData['status'];
  errorMsg: string | null;
  sessionHistoryMessages: Message[];
  messages: ConversationWithSoM[];
  abortController: AbortController | null;
  thinking: boolean;
  browserAvailable: boolean;
  attachments: ProcessedFile[];

  // Mission Control orchestrator state
  orchestratorPlan: OrchestratorPlanStep[] | null;
  orchestratorActiveStep: number | null;
  orchestratorStepResults: OrchestratorStepResult[];
  orchestratorToolCalls: OrchestratorToolCall[];
  orchestratorCursor: CursorState | null;
  orchestratorPhase: 'idle' | 'planning' | 'plan-reveal' | 'executing' | 'complete';
  orchestratorStartTime: number | null;
};
```

**Step 2: Update initial state in store/create.ts**

Add the new fields to the initial state in `apps/ui-tars/src/main/store/create.ts`. Find the initial state object and add:

```typescript
orchestratorPlan: null,
orchestratorActiveStep: null,
orchestratorStepResults: [],
orchestratorToolCalls: [],
orchestratorCursor: null,
orchestratorPhase: 'idle',
orchestratorStartTime: null,
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors related to AppState

**Step 4: Commit**

```bash
git add apps/ui-tars/src/main/store/types.ts apps/ui-tars/src/main/store/create.ts
git commit -m "feat(state): add orchestrator fields to AppState for Mission Control"
```

---

### Task 2: Wire orchestrator callbacks to update AppState

**Files:**
- Modify: `apps/ui-tars/src/main/services/runMultiAgent.ts`

**Step 1: Update orchestrator callbacks to emit state**

Replace the simple logger callbacks with state-updating callbacks. The key changes:

1. Set `orchestratorPhase: 'planning'` before calling `orchestrator.run()`
2. In `onPlanCreated`: set `orchestratorPlan` and `orchestratorPhase: 'plan-reveal'`, then after 2s delay set `orchestratorPhase: 'executing'`
3. In `onStepStart`: set `orchestratorActiveStep` to the step id
4. In `onStepComplete`: push to `orchestratorStepResults`, update the step result
5. On completion: set `orchestratorPhase: 'complete'`

Update the `runMultiAgent` function. Replace the orchestrator creation section (around line 175-198) with:

```typescript
  // Set planning phase
  const startTime = Date.now();
  setState({
    ...getState(),
    status: StatusEnum.RUNNING,
    orchestratorPhase: 'planning',
    orchestratorStartTime: startTime,
    orchestratorPlan: null,
    orchestratorActiveStep: null,
    orchestratorStepResults: [],
    orchestratorToolCalls: [],
  });

  // Create orchestrator
  const orchestrator = new Orchestrator({
    plannerModel,
    agents: {
      browser: browserLoop ? { type: 'browser', loop: browserLoop } : null,
      desktop: { type: 'desktop', loop: desktopLoop },
      api: null,
    },
    signal: abortController?.signal,
    onPlanCreated: (plan) => {
      logger.info(
        `[Orchestrator] Plan created: ${plan.plan.length} steps`,
      );
      setState({
        ...getState(),
        orchestratorPlan: plan.plan.map((s) => ({
          id: s.id,
          agent: s.agent,
          task: s.task,
          depends_on: s.depends_on,
        })),
        orchestratorPhase: 'plan-reveal',
      });
      // After brief reveal, transition to executing
      setTimeout(() => {
        if (getState().orchestratorPhase === 'plan-reveal') {
          setState({ ...getState(), orchestratorPhase: 'executing' });
        }
      }, 2000);
    },
    onStepStart: (step) => {
      logger.info(
        `[Orchestrator] Starting step ${step.id}: ${step.task}`,
      );
      setState({
        ...getState(),
        orchestratorActiveStep: step.id,
      });
    },
    onStepComplete: (step, result) => {
      logger.info(
        `[Orchestrator] Step ${step.id} ${result.success ? 'succeeded' : 'failed'}`,
      );
      const current = getState();
      setState({
        ...current,
        orchestratorStepResults: [
          ...current.orchestratorStepResults,
          {
            stepId: result.stepId,
            success: result.success,
            result: result.result,
            error: result.error,
            retries: result.retries,
            endTime: Date.now(),
          },
        ],
      });
    },
  });
```

Also update the completion section (around line 211-228) to set the phase:

```typescript
  try {
    const result = await orchestrator.run(instructions);

    logger.info(
      `[runMultiAgent] Completed in ${((Date.now() - startTime) / 1000).toFixed(1)}s`,
    );

    setState({
      ...getState(),
      status: result.success ? StatusEnum.END : StatusEnum.ERROR,
      orchestratorPhase: 'complete',
      orchestratorActiveStep: null,
      errorMsg: result.success
        ? null
        : `Some steps failed: ${result.results
            .filter((r) => !r.success)
            .map((r) => `Step ${r.stepId}: ${r.error}`)
            .join('; ')}`,
    });
  } catch (e) {
    logger.error('[runMultiAgent] error:', e);
    setState({
      ...getState(),
      status: StatusEnum.ERROR,
      orchestratorPhase: 'complete',
      orchestratorActiveStep: null,
      errorMsg: e instanceof Error ? e.message : String(e),
    });
  }
```

Remove the duplicate `const startTime = Date.now();` line that was previously at line 202 (it's now part of the state initialization above).

**Step 2: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/ui-tars/src/main/services/runMultiAgent.ts
git commit -m "feat(orchestrator): wire callbacks to update AppState for Mission Control"
```

---

### Task 3: Add window transform IPC routes

**Files:**
- Modify: `apps/ui-tars/src/main/window/index.ts`
- Modify: `apps/ui-tars/src/main/ipcRoutes/window.ts`
- Modify: `apps/ui-tars/src/main/ipcRoutes/index.ts`

**Step 1: Add transform methods to window/index.ts**

Add these functions to `apps/ui-tars/src/main/window/index.ts`:

```typescript
let originalBounds: Electron.Rectangle | null = null;

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

export async function transformToWidget() {
  if (!mainWindow) return;
  const { screen } = await import('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

  // Save current bounds for restore
  originalBounds = mainWindow.getBounds();

  // Shrink to widget size at bottom-right
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setContentProtection(true);
  mainWindow.setBounds(
    {
      x: screenWidth - 400 - 32,
      y: screenHeight - 350 - 32 - 64,
      width: 400,
      height: 350,
    },
    true, // animate
  );
}

export async function expandFromWidget() {
  if (!mainWindow) return;

  if (originalBounds) {
    mainWindow.setBounds(originalBounds, true);
  } else {
    // Fallback to default size
    mainWindow.setBounds({ x: 100, y: 100, width: 1200, height: 700 }, true);
  }

  mainWindow.setAlwaysOnTop(false);
  mainWindow.setContentProtection(false);
  originalBounds = null;
}
```

**Step 2: Add IPC routes for window transform**

Add to `apps/ui-tars/src/main/ipcRoutes/window.ts`:

```typescript
import { transformToWidget, expandFromWidget } from '@main/window/index';

// Add to the existing router:
  transformToWidget: t.procedure.input<void>().handle(async () => {
    await transformToWidget();
  }),
  expandFromWidget: t.procedure.input<void>().handle(async () => {
    await expandFromWidget();
  }),
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/ui-tars/src/main/window/index.ts apps/ui-tars/src/main/ipcRoutes/window.ts
git commit -m "feat(window): add transformToWidget and expandFromWidget with IPC routes"
```

---

## Phase 2: Cursor Overlay & Enhanced Glow (Main Process)

### Task 4: Create cursor overlay BrowserWindow

**Files:**
- Modify: `apps/ui-tars/src/main/window/ScreenMarker.ts`

**Step 1: Add cursorOverlay window to ScreenMarker**

Add a new private field `private cursorOverlay: BrowserWindow | null = null;` to the ScreenMarker class.

Add these methods to the ScreenMarker class:

```typescript
  showCursorOverlay() {
    if (this.cursorOverlay) return;

    const primaryDisplay = screen.getPrimaryDisplay();
    const { width: screenWidth, height: screenHeight } = primaryDisplay.size;

    this.cursorOverlay = new BrowserWindow({
      width: screenWidth,
      height: screenHeight,
      x: 0,
      y: 0,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      thickFrame: false,
      show: false,
      paintWhenInitiallyHidden: true,
      type: 'panel',
      webPreferences: { nodeIntegration: true, contextIsolation: false },
    });

    this.cursorOverlay.setFocusable(false);
    this.cursorOverlay.setContentProtection(true);
    this.cursorOverlay.setIgnoreMouseEvents(true);

    if (env.isWindows) {
      this.cursorOverlay.setAlwaysOnTop(true, 'screen-saver');
    }

    this.cursorOverlay.once('ready-to-show', () => {
      if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
        this.cursorOverlay.showInactive();
      }
    });

    this.cursorOverlay.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(CURSOR_OVERLAY_HTML)}`);
  }

  hideCursorOverlay() {
    this.cursorOverlay?.close();
    this.cursorOverlay = null;
  }

  updateCursorPosition(x: number, y: number, action: string) {
    if (this.cursorOverlay && !this.cursorOverlay.isDestroyed()) {
      this.cursorOverlay.webContents.executeJavaScript(
        `updateCursor(${x}, ${y}, '${action}')`,
      ).catch(() => {});
    }
  }
```

**Step 2: Add the cursor HTML template**

Add this constant above the ScreenMarker class:

```typescript
const CURSOR_OVERLAY_HTML = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100vw; height: 100vh; overflow: hidden; background: transparent; }
  #cursor-container {
    position: absolute;
    transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1), top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    pointer-events: none;
    will-change: left, top;
  }
  .cursor-svg { filter: drop-shadow(0 0 8px rgba(99,102,241,0.6)); }
  .cursor-label {
    position: absolute; top: 28px; left: 20px;
    font: 600 9px/1 'Inter', system-ui, sans-serif;
    color: rgba(99,102,241,0.9); letter-spacing: 0.5px;
    text-shadow: 0 0 4px rgba(99,102,241,0.4);
    white-space: nowrap;
  }
  .ripple {
    position: absolute; top: 50%; left: 50%;
    width: 40px; height: 40px;
    margin: -20px 0 0 -8px;
    border-radius: 50%; border: 2px solid rgba(99,102,241,0.6);
    opacity: 0; transform: scale(0.5);
    pointer-events: none;
  }
  .ripple.active { animation: hw-ripple 0.6s ease-out forwards; }
  @keyframes hw-ripple {
    0% { opacity: 0.8; transform: scale(0.5); }
    100% { opacity: 0; transform: scale(2.5); }
  }
  .action-badge {
    position: absolute; top: -20px; left: 24px;
    font: 500 10px/1 'Inter', system-ui, sans-serif;
    background: rgba(99,102,241,0.9); color: white;
    padding: 3px 8px; border-radius: 4px;
    opacity: 0; transition: opacity 0.2s;
    white-space: nowrap;
  }
  .action-badge.visible { opacity: 1; }
  .thinking-dots {
    position: absolute; top: 50%; left: 50%;
    width: 30px; height: 30px; margin: -15px 0 0 -7px;
  }
  .thinking-dot {
    position: absolute; width: 4px; height: 4px;
    background: rgba(99,102,241,0.8); border-radius: 50%;
  }
  .thinking-dots.active .thinking-dot { animation: hw-orbit 1.2s linear infinite; }
  .thinking-dot:nth-child(1) { animation-delay: 0s; }
  .thinking-dot:nth-child(2) { animation-delay: 0.3s; }
  .thinking-dot:nth-child(3) { animation-delay: 0.6s; }
  @keyframes hw-orbit {
    0% { transform: rotate(0deg) translateX(12px) rotate(0deg); opacity: 1; }
    100% { transform: rotate(360deg) translateX(12px) rotate(-360deg); opacity: 1; }
  }
  #cursor-container.hidden { display: none; }
</style>
</head>
<body>
<div id="cursor-container" class="hidden">
  <svg class="cursor-svg" width="24" height="28" viewBox="0 0 24 28">
    <defs>
      <linearGradient id="ptr" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#6366f1"/>
        <stop offset="100%" stop-color="#a855f7"/>
      </linearGradient>
    </defs>
    <path d="M2 2 L2 22 L7 17 L12 26 L16 24 L11 15 L18 15 Z"
          fill="url(#ptr)" stroke="rgba(255,255,255,0.5)" stroke-width="1"/>
  </svg>
  <div class="cursor-label">heyworkly</div>
  <div class="ripple" id="r1"></div>
  <div class="ripple" id="r2"></div>
  <div class="ripple" id="r3"></div>
  <div class="action-badge" id="badge"></div>
  <div class="thinking-dots" id="thinking">
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
    <div class="thinking-dot"></div>
  </div>
</div>
<script>
  const el = document.getElementById('cursor-container');
  const badge = document.getElementById('badge');
  const thinking = document.getElementById('thinking');

  function updateCursor(x, y, action) {
    el.classList.remove('hidden');
    el.style.left = x + 'px';
    el.style.top = y + 'px';

    // Clear previous effects
    badge.classList.remove('visible');
    thinking.classList.remove('active');
    document.querySelectorAll('.ripple').forEach(r => r.classList.remove('active'));

    if (action === 'click' || action === 'gui_click') {
      setTimeout(() => document.getElementById('r1').classList.add('active'), 0);
      setTimeout(() => document.getElementById('r2').classList.add('active'), 100);
      setTimeout(() => document.getElementById('r3').classList.add('active'), 200);
      setTimeout(() => document.querySelectorAll('.ripple').forEach(r => r.classList.remove('active')), 700);
    } else if (action === 'hotkey' || action === 'gui_hotkey') {
      badge.textContent = 'Hotkey';
      badge.classList.add('visible');
      setTimeout(() => badge.classList.remove('visible'), 1500);
    } else if (action === 'thinking') {
      thinking.classList.add('active');
    } else if (action === 'hide') {
      el.classList.add('hidden');
    }
  }

  function hideCursor() {
    el.classList.add('hidden');
  }
</script>
</body>
</html>`;
```

**Step 3: Update close() and hideOverlaysForExecution()**

Add cursor overlay handling to:
- `close()`: add `this.cursorOverlay?.close(); this.cursorOverlay = null;`
- `hideOverlaysForExecution()`: add hiding of cursorOverlay
- `restoreOverlaysAfterExecution()`: add restoring of cursorOverlay

**Step 4: Add exported functions**

At the bottom of the file, add:

```typescript
export const showCursorOverlay = () => {
  ScreenMarker.getInstance().showCursorOverlay();
};

export const hideCursorOverlay = () => {
  ScreenMarker.getInstance().hideCursorOverlay();
};

export const updateCursorPosition = (x: number, y: number, action: string) => {
  ScreenMarker.getInstance().updateCursorPosition(x, y, action);
};
```

**Step 5: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors

**Step 6: Commit**

```bash
git add apps/ui-tars/src/main/window/ScreenMarker.ts
git commit -m "feat(cursor): add magic cursor overlay BrowserWindow with effects"
```

---

### Task 5: Enhance waterflow glow with reactive states

**Files:**
- Modify: `apps/ui-tars/src/main/window/ScreenMarker.ts`

**Step 1: Add glow state method**

Add a method to ScreenMarker that changes the waterflow CSS dynamically:

```typescript
  setWaterFlowState(state: 'idle' | 'active' | 'step-complete' | 'error' | 'fadeout') {
    if (!this.screenWaterFlow || this.screenWaterFlow.isDestroyed()) return;

    const colorMap: Record<string, string> = {
      idle: 'rgba(30, 144, 255, 0.4)',
      active: 'rgba(30, 144, 255, 0.7)',
      'step-complete': 'rgba(34, 197, 94, 0.6)',
      error: 'rgba(245, 158, 11, 0.6)',
      fadeout: 'rgba(30, 144, 255, 0)',
    };
    const speedMap: Record<string, string> = {
      idle: '5s',
      active: '2s',
      'step-complete': '5s',
      error: '5s',
      fadeout: '5s',
    };

    const color = colorMap[state] || colorMap.idle;
    const speed = speedMap[state] || speedMap.idle;

    this.screenWaterFlow.webContents.executeJavaScript(`
      const style = document.getElementById('water-flow-animation');
      if (style) {
        style.textContent = style.textContent
          .replace(/rgba\\([^)]+\\)/g, '${color}')
          .replace(/animation:[^;]+;/, 'animation: waterflow ${speed} cubic-bezier(0.4, 0, 0.6, 1) infinite;');
      }
    `).catch(() => {});

    // For flash states, revert to idle after a brief delay
    if (state === 'step-complete' || state === 'error') {
      setTimeout(() => this.setWaterFlowState('idle'), 1000);
    }
  }
```

**Step 2: Add exported function**

```typescript
export const setWaterFlowState = (state: 'idle' | 'active' | 'step-complete' | 'error' | 'fadeout') => {
  ScreenMarker.getInstance().setWaterFlowState(state);
};
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/main/window/ScreenMarker.ts
git commit -m "feat(glow): add reactive waterflow glow states (active, success, error)"
```

---

### Task 6: Wire cursor and glow to orchestrator execution

**Files:**
- Modify: `apps/ui-tars/src/main/services/runMultiAgent.ts`

**Step 1: Import cursor and glow functions**

Add imports at the top of `runMultiAgent.ts`:

```typescript
import {
  showCursorOverlay,
  hideCursorOverlay,
  updateCursorPosition,
  showScreenWaterFlow,
  hideScreenWaterFlow,
  setWaterFlowState,
} from '@main/window/ScreenMarker';
import { transformToWidget, expandFromWidget } from '@main/window/index';
```

**Step 2: Add visual lifecycle to execution**

After `beforeAgentRun(settings.operator);` and before the try block, add:

```typescript
  // Start visual effects
  showScreenWaterFlow();
  showCursorOverlay();
```

Update the `onPlanCreated` callback — after setting state, trigger window transform:

```typescript
    onPlanCreated: (plan) => {
      // ... existing state update ...
      // Transform window to widget after plan reveal delay
      setTimeout(() => {
        if (getState().orchestratorPhase === 'plan-reveal') {
          setState({ ...getState(), orchestratorPhase: 'executing' });
          transformToWidget();
        }
      }, 2000);
    },
```

Update `onStepStart` to set glow to active:

```typescript
    onStepStart: (step) => {
      // ... existing ...
      setWaterFlowState('active');
    },
```

Update `onStepComplete` to flash glow:

```typescript
    onStepComplete: (step, result) => {
      // ... existing ...
      setWaterFlowState(result.success ? 'step-complete' : 'error');
    },
```

In the `finally` block, add cleanup:

```typescript
  } finally {
    afterAgentRun(settings.operator);
    hideCursorOverlay();
    setWaterFlowState('fadeout');
    setTimeout(() => {
      hideScreenWaterFlow();
      expandFromWidget();
    }, 1500);
  }
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/ui-tars/src/main/services/runMultiAgent.ts
git commit -m "feat(execution): wire cursor overlay and reactive glow to orchestrator lifecycle"
```

---

## Phase 3: New Home Page (Renderer)

### Task 7: Create new multi-agent home page

**Files:**
- Create: `apps/ui-tars/src/renderer/src/pages/home/MultiAgentHome.tsx`

**Step 1: Create the component**

Create the new home page with single centered input, suggestion chips, and branding:

```tsx
import { useState, useRef, KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { Paperclip, ArrowUp } from 'lucide-react';

import { useSession } from '@renderer/hooks/useSession';
import { Operator } from '@main/store/types';
import {
  checkVLMSettings,
  LocalSettingsDialog,
} from '@renderer/components/Settings/local';
import { DragArea } from '@renderer/components/Common/drag';
import { api } from '@renderer/api';

const SUGGESTIONS = [
  'Search for flights from NYC to London',
  'Fill out the expense report form',
  'Find the cheapest laptop on Amazon',
  'Send a Slack message to #general',
];

const MultiAgentHome = () => {
  const navigate = useNavigate();
  const { createSession } = useSession();
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;

    const hasVLM = await checkVLMSettings();
    if (!hasVLM) {
      setSettingsOpen(true);
      return;
    }

    const session = await createSession(
      trimmed.slice(0, 40),
      { operator: Operator.LocalComputer },
    );

    // Set instructions and start the agent
    await api.setInstructions({ instructions: trimmed });

    navigate('/local', {
      state: {
        operator: Operator.LocalComputer,
        sessionId: session?.id,
        from: 'home',
        autoRun: true,
      },
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleSuggestionClick = (text: string) => {
    setInput(text);
    textareaRef.current?.focus();
  };

  return (
    <div className="w-full h-full flex flex-col">
      <DragArea />
      <div className="w-full h-full flex flex-col items-center justify-center relative">
        {/* Background grid */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />

        {/* Shimmer glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-primary/5 rounded-full blur-[120px]" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-2xl px-6">
          {/* Brand */}
          <h1 className="text-5xl font-bold tracking-tight mb-2">
            <span className="bg-gradient-to-r from-orange-400 via-orange-500 to-orange-600 bg-clip-text text-transparent">
              heyworkly
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mb-10">
            What would you like me to do?
          </p>

          {/* Input area */}
          <div className="w-full relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your task..."
              rows={3}
              className="w-full resize-none rounded-xl border border-border bg-card/50 backdrop-blur-sm px-4 py-3 pr-24 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/50 transition-all"
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <button
                type="button"
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                title="Attach file"
              >
                <Paperclip size={16} />
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!input.trim()}
                className="p-2 rounded-lg bg-primary text-primary-foreground disabled:opacity-40 hover:bg-primary/90 transition-colors"
                title="Start task"
              >
                <ArrowUp size={16} />
              </button>
            </div>
          </div>

          {/* Suggestion chips */}
          <div className="flex flex-wrap gap-2 mt-4 justify-center">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSuggestionClick(s)}
                className="px-3 py-1.5 text-xs rounded-full border border-border bg-card/30 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <DragArea />
      <LocalSettingsDialog
        isOpen={settingsOpen}
        onSubmit={() => {
          setSettingsOpen(false);
          handleSubmit();
        }}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};

export default MultiAgentHome;
```

**Step 2: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/home/MultiAgentHome.tsx
git commit -m "feat(home): create multi-agent single-input home page"
```

---

### Task 8: Conditional home page routing

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/home/index.tsx`

**Step 1: Add conditional rendering**

Update the home page to conditionally render the multi-agent home when `multiAgentEnabled` is true. Modify `pages/home/index.tsx`:

Add at the top of the file:

```typescript
import { useSetting } from '@renderer/hooks/useSetting';
import { lazy, Suspense } from 'react';

const MultiAgentHome = lazy(() => import('./MultiAgentHome'));
```

Then wrap the existing Home component to conditionally render:

```typescript
const HomeRouter = () => {
  const { settings } = useSetting();
  const multiAgentEnabled = (settings as any)?.multiAgentEnabled ?? false;

  if (multiAgentEnabled) {
    return (
      <Suspense fallback={<div className="loading-container"><div className="loading-spinner" /></div>}>
        <MultiAgentHome />
      </Suspense>
    );
  }

  return <Home />;
};

export default HomeRouter;
```

Remove the existing `export default Home;` and replace with the `HomeRouter` export.

**Step 2: Verify the app builds**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: No errors

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/home/index.tsx
git commit -m "feat(home): conditional routing between multi-agent and legacy home"
```

---

## Phase 4: Mission Control Widget (Renderer)

### Task 9: Create PlanStepList component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/MissionControl/PlanStepList.tsx`

**Step 1: Create the component**

```tsx
import { Check, Circle, Loader2, X, Globe, Monitor, Plug } from 'lucide-react';
import { cn } from '@renderer/utils';
import type {
  OrchestratorPlanStep,
  OrchestratorStepResult,
} from '@main/store/types';

interface PlanStepListProps {
  steps: OrchestratorPlanStep[];
  activeStepId: number | null;
  results: OrchestratorStepResult[];
}

const AGENT_ICONS: Record<string, typeof Globe> = {
  browser: Globe,
  desktop: Monitor,
  api: Plug,
};

const AGENT_LABELS: Record<string, string> = {
  browser: 'Browser',
  desktop: 'Desktop',
  api: 'API',
};

export function PlanStepList({ steps, activeStepId, results }: PlanStepListProps) {
  const resultMap = new Map(results.map((r) => [r.stepId, r]));

  return (
    <div className="space-y-0.5">
      {steps.map((step) => {
        const result = resultMap.get(step.id);
        const isActive = step.id === activeStepId;
        const isDone = result?.success === true;
        const isFailed = result?.success === false;
        const AgentIcon = AGENT_ICONS[step.agent] || Monitor;

        return (
          <div
            key={step.id}
            className={cn(
              'flex items-start gap-2 px-2 py-1.5 rounded-md text-xs transition-colors',
              isActive && 'bg-primary/10',
              isDone && 'opacity-70',
            )}
          >
            {/* Status icon */}
            <div className="mt-0.5 flex-shrink-0">
              {isDone && <Check size={12} className="text-green-500" />}
              {isFailed && <X size={12} className="text-red-500" />}
              {isActive && !result && (
                <Loader2 size={12} className="text-primary animate-spin" />
              )}
              {!isActive && !result && (
                <Circle size={12} className="text-muted-foreground/40" />
              )}
            </div>

            {/* Step text */}
            <span className={cn(
              'flex-1 min-w-0 truncate',
              isActive ? 'text-foreground font-medium' : 'text-muted-foreground',
            )}>
              {step.id}. {step.task}
            </span>

            {/* Agent badge */}
            <div className="flex items-center gap-1 flex-shrink-0 text-muted-foreground/60">
              <AgentIcon size={10} />
              <span className="text-[10px]">{AGENT_LABELS[step.agent]}</span>
            </div>

            {/* Retry badge */}
            {isFailed && result.retries > 0 && (
              <span className="text-[10px] text-amber-500 flex-shrink-0">
                {result.retries}x
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
mkdir -p apps/ui-tars/src/renderer/src/components/MissionControl
git add apps/ui-tars/src/renderer/src/components/MissionControl/PlanStepList.tsx
git commit -m "feat(widget): create PlanStepList component with status indicators"
```

---

### Task 10: Create ProgressBar component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/MissionControl/ProgressBar.tsx`

**Step 1: Create the component**

```tsx
interface ProgressBarProps {
  completed: number;
  total: number;
}

export function ProgressBar({ completed, total }: ProgressBarProps) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-muted-foreground tabular-nums w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/MissionControl/ProgressBar.tsx
git commit -m "feat(widget): create ProgressBar component"
```

---

### Task 11: Create MissionControlWidget component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/MissionControl/Widget.tsx`

This is the main widget that assembles PlanStepList and ProgressBar.

**Step 1: Create the component**

```tsx
import { Pause, Square, RotateCcw, Maximize2 } from 'lucide-react';

import { useStore } from '@renderer/hooks/useStore';
import { api } from '@renderer/api';
import { PlanStepList } from './PlanStepList';
import { ProgressBar } from './ProgressBar';

export function MissionControlWidget() {
  const plan = useStore((s) => s.orchestratorPlan);
  const activeStep = useStore((s) => s.orchestratorActiveStep);
  const results = useStore((s) => s.orchestratorStepResults);
  const phase = useStore((s) => s.orchestratorPhase);
  const startTime = useStore((s) => s.orchestratorStartTime);

  if (!plan || phase === 'idle') return null;

  const completed = results.filter((r) => r.success).length;
  const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;

  // Find active step agent
  const activeStepData = plan.find((s) => s.id === activeStep);

  return (
    <div className="flex flex-col h-full bg-background/95 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold text-primary">
          heyworkly
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => api.pauseRun()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Pause"
          >
            <Pause size={12} />
          </button>
          <button
            onClick={() => api.stopRun()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Stop"
          >
            <Square size={12} />
          </button>
          <button
            onClick={() => api.expandFromWidget?.()}
            className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Expand"
          >
            <Maximize2 size={12} />
          </button>
        </div>
      </div>

      {/* Planning state */}
      {phase === 'planning' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Planning your task...</p>
          </div>
        </div>
      )}

      {/* Plan list */}
      {(phase === 'plan-reveal' || phase === 'executing' || phase === 'complete') && (
        <>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            <PlanStepList
              steps={plan}
              activeStepId={activeStep}
              results={results}
            />
          </div>

          {/* Footer stats */}
          <div className="px-3 py-2 border-t border-border space-y-1.5">
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>
                Step {activeStep ?? '-'} of {plan.length}
                {activeStepData && ` · ${activeStepData.agent} agent`}
              </span>
              <span>{elapsed}s</span>
            </div>
            <ProgressBar completed={completed} total={plan.length} />
          </div>
        </>
      )}
    </div>
  );
}
```

**Step 2: Create barrel export**

Create `apps/ui-tars/src/renderer/src/components/MissionControl/index.ts`:

```typescript
export { MissionControlWidget } from './Widget';
export { PlanStepList } from './PlanStepList';
export { ProgressBar } from './ProgressBar';
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/MissionControl/
git commit -m "feat(widget): create MissionControlWidget with plan list and progress"
```

---

### Task 12: Integrate widget into local operator page

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/local/index.tsx`

**Step 1: Read the current local page**

Read `apps/ui-tars/src/renderer/src/pages/local/index.tsx` to understand its structure.

**Step 2: Add conditional widget rendering**

Import the widget and settings:

```typescript
import { MissionControlWidget } from '@renderer/components/MissionControl';
import { useSetting } from '@renderer/hooks/useSetting';
```

In the component, add:

```typescript
const { settings } = useSetting();
const multiAgentEnabled = (settings as any)?.multiAgentEnabled ?? false;
const orchestratorPhase = useStore((s) => s.orchestratorPhase);
```

When `multiAgentEnabled` is true and `orchestratorPhase !== 'idle'`, render the MissionControlWidget as an overlay in the bottom section of the page:

```tsx
{multiAgentEnabled && orchestratorPhase !== 'idle' && (
  <div className="fixed bottom-0 right-0 w-[400px] h-[350px] z-40 border-l border-t border-border rounded-tl-xl overflow-hidden shadow-xl">
    <MissionControlWidget />
  </div>
)}
```

Place this inside the component's return, just before the closing `</div>`.

**Step 3: Handle autoRun from router state**

When navigating from the multi-agent home with `autoRun: true` in location state, automatically trigger `api.runAgent()`:

```typescript
const location = useLocation();

useEffect(() => {
  if ((location.state as any)?.autoRun && !thinking) {
    api.runAgent();
  }
}, []);
```

**Step 4: Verify the app builds**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.web.json 2>&1 | head -20`
Expected: No errors

**Step 5: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/local/index.tsx
git commit -m "feat(local): integrate MissionControlWidget overlay into local page"
```

---

## Phase 5: Results View (Renderer)

### Task 13: Create PlanSummary component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/Results/PlanSummary.tsx`

**Step 1: Create the component**

```tsx
import { Check, X, Globe, Monitor, Plug } from 'lucide-react';
import { cn } from '@renderer/utils';
import type {
  OrchestratorPlanStep,
  OrchestratorStepResult,
} from '@main/store/types';

interface PlanSummaryProps {
  steps: OrchestratorPlanStep[];
  results: OrchestratorStepResult[];
  startTime: number | null;
}

const AGENT_ICON: Record<string, typeof Globe> = {
  browser: Globe,
  desktop: Monitor,
  api: Plug,
};

export function PlanSummary({ steps, results, startTime }: PlanSummaryProps) {
  const resultMap = new Map(results.map((r) => [r.stepId, r]));
  const succeeded = results.filter((r) => r.success).length;
  const totalTime = startTime
    ? ((Date.now() - startTime) / 1000).toFixed(1)
    : '?';
  const agentTypes = new Set(steps.map((s) => s.agent));
  const allSuccess = results.length > 0 && results.every((r) => r.success);

  return (
    <div className="space-y-4">
      {/* Summary banner */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium',
          allSuccess
            ? 'bg-green-500/10 text-green-500'
            : 'bg-amber-500/10 text-amber-500',
        )}
      >
        {allSuccess ? <Check size={16} /> : <X size={16} />}
        {allSuccess ? 'Task Complete' : 'Task Partially Complete'}
        <span className="text-muted-foreground font-normal ml-auto">
          {steps.length} steps · {totalTime}s · {agentTypes.size} agent{agentTypes.size > 1 ? 's' : ''}
        </span>
      </div>

      {/* Step list */}
      <div className="border border-border rounded-lg divide-y divide-border">
        {steps.map((step) => {
          const result = resultMap.get(step.id);
          const Icon = AGENT_ICON[step.agent] || Monitor;
          const elapsed =
            result?.startTime && result?.endTime
              ? ((result.endTime - result.startTime) / 1000).toFixed(1)
              : '-';

          return (
            <div
              key={step.id}
              className="flex items-center gap-3 px-3 py-2 text-sm"
            >
              {result?.success ? (
                <Check size={14} className="text-green-500 flex-shrink-0" />
              ) : result?.success === false ? (
                <X size={14} className="text-red-500 flex-shrink-0" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-muted-foreground/30 flex-shrink-0" />
              )}
              <span className="flex-1 min-w-0 truncate text-foreground">
                {step.id}. {step.task}
              </span>
              <Icon size={12} className="text-muted-foreground flex-shrink-0" />
              <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">
                {elapsed}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
mkdir -p apps/ui-tars/src/renderer/src/components/Results
git add apps/ui-tars/src/renderer/src/components/Results/PlanSummary.tsx
git commit -m "feat(results): create PlanSummary component with step timings"
```

---

### Task 14: Create ResultsView component

**Files:**
- Create: `apps/ui-tars/src/renderer/src/components/Results/ResultsView.tsx`

**Step 1: Create the component**

```tsx
import { useStore } from '@renderer/hooks/useStore';
import { PlanSummary } from './PlanSummary';

export function ResultsView() {
  const plan = useStore((s) => s.orchestratorPlan);
  const results = useStore((s) => s.orchestratorStepResults);
  const startTime = useStore((s) => s.orchestratorStartTime);
  const phase = useStore((s) => s.orchestratorPhase);

  if (phase !== 'complete' || !plan) return null;

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <PlanSummary
        steps={plan}
        results={results}
        startTime={startTime}
      />

      {/* Follow-up input placeholder */}
      <div className="text-center text-xs text-muted-foreground pt-4">
        Use the chat input below to start a follow-up task.
      </div>
    </div>
  );
}
```

**Step 2: Create barrel export**

Create `apps/ui-tars/src/renderer/src/components/Results/index.ts`:

```typescript
export { PlanSummary } from './PlanSummary';
export { ResultsView } from './ResultsView';
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/components/Results/
git commit -m "feat(results): create ResultsView with PlanSummary"
```

---

### Task 15: Integrate ResultsView into local page

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/local/index.tsx`

**Step 1: Import ResultsView**

```typescript
import { ResultsView } from '@renderer/components/Results';
```

**Step 2: Add conditional rendering**

When `multiAgentEnabled` is true and `orchestratorPhase === 'complete'`, show the ResultsView above the chat input:

```tsx
{multiAgentEnabled && orchestratorPhase === 'complete' && (
  <ResultsView />
)}
```

Place this in the main content area, above the existing chat input section.

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/local/index.tsx
git commit -m "feat(local): integrate ResultsView for post-execution display"
```

---

## Phase 6: Orchestrator State Reset & Stop

### Task 16: Reset orchestrator state on new runs and stops

**Files:**
- Modify: `apps/ui-tars/src/main/ipcRoutes/agent.ts`

**Step 1: Reset orchestrator fields on clearHistory**

Update the `clearHistory` handler to also reset orchestrator fields:

```typescript
  clearHistory: t.procedure.input<void>().handle(async () => {
    store.setState({
      status: StatusEnum.END,
      messages: [],
      sessionHistoryMessages: [],
      thinking: false,
      errorMsg: null,
      instructions: '',
      attachments: [],
      // Reset orchestrator state
      orchestratorPlan: null,
      orchestratorActiveStep: null,
      orchestratorStepResults: [],
      orchestratorToolCalls: [],
      orchestratorCursor: null,
      orchestratorPhase: 'idle',
      orchestratorStartTime: null,
    });
  }),
```

**Step 2: Reset orchestrator fields on stopRun**

Update the `stopRun` handler to also reset orchestrator phase:

```typescript
  stopRun: t.procedure.input<void>().handle(async () => {
    const { abortController } = store.getState();
    store.setState({
      status: StatusEnum.END,
      thinking: false,
      orchestratorPhase: 'idle',
      orchestratorActiveStep: null,
    });
    // ... rest of existing handler
  }),
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/main/ipcRoutes/agent.ts
git commit -m "feat(agent): reset orchestrator state on clearHistory and stopRun"
```

---

### Task 17: Add expandFromWidget IPC route

**Files:**
- Modify: `apps/ui-tars/src/main/ipcRoutes/window.ts`
- Modify: `apps/ui-tars/src/renderer/src/api.ts` (if needed — verify auto-typing)

**Step 1: Read the current window route file**

Read `apps/ui-tars/src/main/ipcRoutes/window.ts` to see its structure.

**Step 2: Add the transform routes**

Import the functions:

```typescript
import { transformToWidget, expandFromWidget } from '@main/window/index';
```

Add to the router:

```typescript
  transformToWidget: t.procedure.input<void>().handle(async () => {
    await transformToWidget();
  }),
  expandFromWidget: t.procedure.input<void>().handle(async () => {
    await expandFromWidget();
  }),
```

**Step 3: Verify TypeScript compiles**

Run: `cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | head -20`
Expected: No errors

**Step 4: Commit**

```bash
git add apps/ui-tars/src/main/ipcRoutes/window.ts
git commit -m "feat(ipc): expose transformToWidget and expandFromWidget routes"
```

---

## Phase 7: End-to-End Wiring

### Task 18: Wire auto-run from multi-agent home submission

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/local/index.tsx`

**Step 1: Read current local page implementation**

Read the full local page to understand the existing `useRunAgent` hook integration.

**Step 2: Add effect to auto-start execution**

After the component mounts and session is set, if `location.state?.autoRun` is true:

```typescript
import { useLocation } from 'react-router';
import { useRunAgent } from '@renderer/hooks/useRunAgent';

// In the component:
const location = useLocation();
const { run } = useRunAgent();

useEffect(() => {
  const state = location.state as { autoRun?: boolean } | null;
  if (state?.autoRun) {
    // Small delay to let session initialize
    const t = setTimeout(() => {
      api.runAgent();
    }, 300);
    return () => clearTimeout(t);
  }
}, []);
```

**Step 3: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/local/index.tsx
git commit -m "feat(local): auto-start agent execution when navigating from multi-agent home"
```

---

### Task 19: Add completion toast

**Files:**
- Modify: `apps/ui-tars/src/renderer/src/pages/local/index.tsx`

**Step 1: Add effect to show toast on orchestrator completion**

```typescript
import { toast } from 'sonner';

// In the component:
const prevPhase = useRef(orchestratorPhase);

useEffect(() => {
  if (prevPhase.current === 'executing' && orchestratorPhase === 'complete' && multiAgentEnabled) {
    const plan = useStore.getState().orchestratorPlan;
    const results = useStore.getState().orchestratorStepResults;
    const startTime = useStore.getState().orchestratorStartTime;
    const elapsed = startTime ? Math.round((Date.now() - startTime) / 1000) : 0;
    const allSuccess = results.every((r) => r.success);

    toast(
      allSuccess ? 'All done!' : 'Task completed with errors',
      {
        description: `${plan?.length ?? 0} steps · ${elapsed}s`,
        duration: 3000,
      },
    );
  }
  prevPhase.current = orchestratorPhase;
}, [orchestratorPhase, multiAgentEnabled]);
```

**Step 2: Commit**

```bash
git add apps/ui-tars/src/renderer/src/pages/local/index.tsx
git commit -m "feat(local): add completion toast notification for multi-agent runs"
```

---

### Task 20: Verify full app build

**Step 1: Run TypeScript checks**

Run both tsconfig checks:

```bash
cd apps/ui-tars && npx tsc --noEmit -p tsconfig.node.json 2>&1 | tail -5
cd apps/ui-tars && npx tsc --noEmit -p tsconfig.web.json 2>&1 | tail -5
```

Expected: No errors (or only pre-existing ones unrelated to our changes)

**Step 2: Run tests**

```bash
pnpm test -- --run 2>&1 | tail -20
```

Expected: All existing tests pass. No new test failures.

**Step 3: Fix any issues found**

Address any compilation errors or test failures. Common issues to check:
- Missing imports
- Type mismatches between AppState additions and existing code
- Path alias resolution

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve build issues from Mission Control integration"
```

---

### Task 21: Final integration commit

**Step 1: Verify everything works together**

Run the dev server:

```bash
cd apps/ui-tars && npm run dev
```

Test the flow:
1. Open Settings → Model → Enable Multi-Agent Mode toggle
2. Verify new home page appears with single input
3. Enter a task and submit
4. Verify the app navigates to `/local` and starts execution
5. Verify the MissionControlWidget appears
6. Verify the waterflow glow border appears
7. When complete, verify ResultsView appears

**Step 2: Run full test suite**

```bash
pnpm test -- --run
```

**Step 3: Commit any remaining polish**

```bash
git add -A
git commit -m "feat: complete Mission Control UX integration"
```

---

## Summary

| Phase | Tasks | What it delivers |
|-------|-------|-----------------|
| 1: State & Data | Tasks 1-3 | AppState extensions, orchestrator callbacks, window transform IPC |
| 2: Cursor & Glow | Tasks 4-6 | Magic cursor overlay, reactive waterflow, execution wiring |
| 3: Home Page | Tasks 7-8 | Single-input multi-agent home, conditional routing |
| 4: Widget | Tasks 9-12 | PlanStepList, ProgressBar, MissionControlWidget, page integration |
| 5: Results | Tasks 13-15 | PlanSummary, ResultsView, page integration |
| 6: Reset & Stop | Tasks 16-17 | Clean state management on stop/clear/new-run |
| 7: End-to-End | Tasks 18-21 | Auto-run, completion toast, build verification |
